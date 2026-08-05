jest.mock('../../src/config/database', () => ({
  ordemServico: {
    findMany:   jest.fn(),
    findUnique: jest.fn(),
    create:     jest.fn(),
    update:     jest.fn(),
  },
}));

const prisma              = require('../../src/config/database');
const ordemServicoService = require('../../src/services/ordemServicoService');

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
    const ordemMock = { id: 1, status: 'EM_ANDAMENTO' };
    prisma.ordemServico.findUnique.mockResolvedValue(ordemMock);
    prisma.ordemServico.update.mockResolvedValue({ ...ordemMock, status: 'FINALIZADO' });

    await ordemServicoService.atualizarStatus(1, 'FINALIZADO');

    const chamada = prisma.ordemServico.update.mock.calls[0][0];
    expect(chamada.data.dataFechamento).toBeDefined();
    expect(chamada.data.status).toBe('FINALIZADO');
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