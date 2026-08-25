jest.mock('../../src/config/database', () => ({
  ordemServico: {
    findMany:   jest.fn(),
    findUnique: jest.fn(),
    create:     jest.fn(),
    update:     jest.fn(),
  },
  // Módulo 4: o encerramento da OS passou a rodar dentro de uma transação,
  // junto com a geração da conta a receber.
  contaReceber: { findUnique: jest.fn(), create: jest.fn() },
  $transaction: jest.fn(),
}));

const prisma              = require('../../src/config/database');
const ordemServicoService = require('../../src/services/ordemServicoService');

/** Transação falsa que devolve os mesmos mocks do prisma. */
function transacaoFake() {
  const tx = {
    ordemServico: { update: jest.fn().mockResolvedValue({}) },
    contaReceber: {
      findUnique: jest.fn().mockResolvedValue(null),
      create:     jest.fn().mockImplementation(async (a) => ({ id: 1, ...a.data })),
    },
  };
  prisma.$transaction.mockImplementation((fn) => fn(tx));
  return tx;
}

describe('ordemServicoService', () => {
  beforeEach(() => jest.clearAllMocks());

  test('abrirOrdem deve criar ordem com status INICIAL', async () => {
    const novaOrdem = { id: 1, numero: 'OS-2026-001', status: 'INICIAL' };
    prisma.ordemServico.create.mockResolvedValue(novaOrdem);

    const resultado = await ordemServicoService.abrirOrdem(
      { defeitoRelatado: 'Não liga', equipamentoId: 1 }, 1
    );

    expect(resultado.status).toBe('INICIAL');
    expect(prisma.ordemServico.create).toHaveBeenCalledTimes(1);
  });

  test('atualizarStatus FINALIZADO deve registrar dataFechamento', async () => {
    const ordemMock = { id: 1, status: 'EM_ANDAMENTO', itens: [] };
    prisma.ordemServico.findUnique.mockResolvedValue(ordemMock);
    const tx = transacaoFake();

    await ordemServicoService.faturarEEncerrar(1);

    const chamada = tx.ordemServico.update.mock.calls[0][0];
    expect(chamada.data.dataFechamento).toBeDefined();
    expect(chamada.data.status).toBe('FINALIZADO');
  });

  // ----- Módulo 4 (parte 2): conta a receber gerada no encerramento -----

  test('encerrar a OS gera a conta a receber na mesma transação', async () => {
    prisma.ordemServico.findUnique.mockResolvedValue({
      id: 1, numero: 'OS-2026-000104', status: 'EM_ANDAMENTO',
      valorOrcamento: '890.00', itens: [],
      equipamento: { cliente: { id: 7, nome: 'Marcos Almeida' } },
    });
    const tx = transacaoFake();

    await ordemServicoService.faturarEEncerrar(1);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.contaReceber.create).toHaveBeenCalledTimes(1);
    expect(tx.contaReceber.create.mock.calls[0][0].data).toMatchObject({
      ordemId: 1, clienteId: 7, valor: '890.00',
    });
  });

  test('mudar para outro status não gera conta', async () => {
    prisma.ordemServico.findUnique.mockResolvedValue({
      id: 1, status: 'AUTORIZADO', valorOrcamento: '890.00', itens: [],
    });
    const tx = transacaoFake();

    await ordemServicoService.atualizarStatus(1, 'EM_ANDAMENTO');

    expect(tx.contaReceber.create).not.toHaveBeenCalled();
  });

  test('reenviar FINALIZADO numa OS já finalizada não gera outra conta', async () => {
    prisma.ordemServico.findUnique.mockResolvedValue({
      id: 1, status: 'FINALIZADO', valorOrcamento: '890.00', itens: [],
    });
    const tx = transacaoFake();

    await ordemServicoService.faturarEEncerrar(1);

    expect(tx.contaReceber.create).not.toHaveBeenCalled();
  });

  test('atualizarStatus não encerra a OS sem liberação de faturamento', async () => {
    prisma.ordemServico.findUnique.mockResolvedValue({
      id: 1, status: 'EM_ANDAMENTO', valorOrcamento: '890.00', itens: [],
    });
    transacaoFake();

    await expect(ordemServicoService.atualizarStatus(1, 'FINALIZADO'))
      .rejects.toThrow(/depende de liberação da gerência/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // ----- Módulo 3 (parte 2): correções de orçamento -----

  describe('parseDataLocal', () => {
    test('interpreta AAAA-MM-DD no fuso local, sem perder um dia', () => {
      const data = ordemServicoService.parseDataLocal('2026-08-20');
      expect(data.getFullYear()).toBe(2026);
      expect(data.getMonth()).toBe(7); // agosto
      expect(data.getDate()).toBe(20);
      expect(data.toLocaleDateString('pt-BR')).toBe('20/08/2026');
    });

    test('devolve null quando não há data', () => {
      expect(ordemServicoService.parseDataLocal('')).toBeNull();
      expect(ordemServicoService.parseDataLocal(null)).toBeNull();
    });
  });

  describe('validarValorOrcamento', () => {
    test('aceita valor com ponto ou vírgula', () => {
      expect(ordemServicoService.validarValorOrcamento('450.00')).toBe('450.00');
      expect(ordemServicoService.validarValorOrcamento('320,50')).toBe('320.50');
    });

    test.each([
      ['',      'Informe o valor do orçamento.'],
      ['0',     'O valor do orçamento deve ser maior que zero.'],
      ['-50',   'O valor do orçamento deve ser maior que zero.'],
      ['abc',   'O valor do orçamento deve ser um número.'],
    ])('rejeita o valor %p', (entrada, mensagem) => {
      expect(() => ordemServicoService.validarValorOrcamento(entrada)).toThrow(mensagem);
    });
  });

  describe('registrarOrcamento', () => {
    test('não altera o orçamento de uma OS já autorizada', async () => {
      prisma.ordemServico.findUnique.mockResolvedValue({ id: 1, status: 'AUTORIZADO' });

      await expect(
        ordemServicoService.registrarOrcamento(1, { valorOrcamento: '999' })
      ).rejects.toThrow(/Não é possível alterar o orçamento/);

      expect(prisma.ordemServico.update).not.toHaveBeenCalled();
    });

    test('não apaga a data de aprovação quando o formulário não envia o campo', async () => {
      prisma.ordemServico.findUnique.mockResolvedValue({ id: 1, status: 'ORCAMENTO' });
      prisma.ordemServico.update.mockResolvedValue({});

      await ordemServicoService.registrarOrcamento(1, {
        valorOrcamento: '450', previsaoEntrega: '2026-08-20',
      });

      const { data } = prisma.ordemServico.update.mock.calls[0][0];
      expect(data).not.toHaveProperty('dataAprovacao');
      expect(data.status).toBe('ORCAMENTO');
      expect(data.previsaoEntrega.getDate()).toBe(20);
    });
  });

  describe('aprovarOrcamento', () => {
    test('exige status ORCAMENTO', async () => {
      prisma.ordemServico.findUnique.mockResolvedValue({ id: 1, status: 'INICIAL' });

      await expect(ordemServicoService.aprovarOrcamento(1))
        .rejects.toThrow(/Só é possível aprovar uma OS com status ORCAMENTO/);
      expect(prisma.ordemServico.update).not.toHaveBeenCalled();
    });

    test('exige valor de orçamento registrado', async () => {
      prisma.ordemServico.findUnique.mockResolvedValue({ id: 1, status: 'ORCAMENTO', valorOrcamento: null });

      await expect(ordemServicoService.aprovarOrcamento(1))
        .rejects.toThrow(/Registre o valor do orçamento antes/);
    });

    test('aprova e grava a data de aprovação', async () => {
      prisma.ordemServico.findUnique.mockResolvedValue({ id: 1, status: 'ORCAMENTO', valorOrcamento: '450' });
      prisma.ordemServico.update.mockResolvedValue({});

      await ordemServicoService.aprovarOrcamento(1);

      const { data } = prisma.ordemServico.update.mock.calls[0][0];
      expect(data.status).toBe('AUTORIZADO');
      expect(data.dataAprovacao).toBeInstanceOf(Date);
    });
  });
});