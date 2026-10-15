jest.mock('../../src/config/database', () => ({
  servicoExecutado: {
    findMany:   jest.fn(),
    findUnique: jest.fn(),
    create:     jest.fn(),
    delete:     jest.fn(),
  },
  ordemServico: {
    findUnique: jest.fn(),
    update:     jest.fn(),
  },
  $transaction: jest.fn(),
}));

const prisma  = require('../../src/config/database');
const servico = require('../../src/services/servicoExecutadoService');

/** Data de N dias atrás, para simular serviços antigos. */
function diasAtras(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

describe('servicoExecutadoService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('podeRegistrarServico', () => {
    test.each([
      ['AUTORIZADO',   true],
      ['EM_ANDAMENTO', true],
      ['INICIAL',      false],
      ['ORCAMENTO',    false],
      ['CANCELADO',    false],
      ['FINALIZADO',   false],
    ])('status %s -> %p', (status, esperado) => {
      expect(servico.podeRegistrarServico(status)).toBe(esperado);
    });
  });

  describe('calcularGarantia', () => {
    test('sem garantia quando garantiaDias é nulo ou zero', () => {
      expect(servico.calcularGarantia({ garantiaDias: null, executadoEm: new Date() }).situacao).toBe('SEM_GARANTIA');
      expect(servico.calcularGarantia({ garantiaDias: 0,    executadoEm: new Date() }).situacao).toBe('SEM_GARANTIA');
    });

    test('90 dias registrados hoje ficam em garantia', () => {
      const g = servico.calcularGarantia({ garantiaDias: 90, executadoEm: new Date() });
      expect(g.situacao).toBe('EM_GARANTIA');
      expect(g.diasRestantes).toBe(90);
    });

    test('o último dia de cobertura ainda está em garantia', () => {
      const g = servico.calcularGarantia({ garantiaDias: 90, executadoEm: diasAtras(90) });
      expect(g.situacao).toBe('EM_GARANTIA');
      expect(g.diasRestantes).toBe(0);
    });

    test('um dia depois do prazo a garantia está vencida', () => {
      const g = servico.calcularGarantia({ garantiaDias: 90, executadoEm: diasAtras(91) });
      expect(g.situacao).toBe('VENCIDA');
    });
  });

  describe('registrarServico', () => {
    test('bloqueia registro em OS que não está autorizada', async () => {
      prisma.ordemServico.findUnique.mockResolvedValue({ id: 1, numero: 'OS-1', status: 'INICIAL' });

      await expect(servico.registrarServico(1, { descricao: 'Troca da placa-mãe' }))
        .rejects.toThrow(/Não é possível registrar serviços/);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    test('rejeita descrição curta demais', async () => {
      prisma.ordemServico.findUnique.mockResolvedValue({ id: 1, numero: 'OS-1', status: 'AUTORIZADO' });

      await expect(servico.registrarServico(1, { descricao: 'abc' }))
        .rejects.toThrow(/pelo menos 5 caracteres/);
    });

    test('rejeita garantia negativa ou acima do limite', async () => {
      prisma.ordemServico.findUnique.mockResolvedValue({ id: 1, numero: 'OS-1', status: 'AUTORIZADO' });

      await expect(servico.registrarServico(1, { descricao: 'Troca da placa-mãe', garantiaDias: '-5' }))
        .rejects.toThrow(/igual ou maior que zero/);
      await expect(servico.registrarServico(1, { descricao: 'Troca da placa-mãe', garantiaDias: '9999' }))
        .rejects.toThrow(/não pode ultrapassar/);
    });

    test('numa OS AUTORIZADO cria o serviço e move o status para EM_ANDAMENTO', async () => {
      prisma.ordemServico.findUnique.mockResolvedValue({ id: 1, numero: 'OS-1', status: 'AUTORIZADO' });

      const tx = {
        servicoExecutado: { create: jest.fn().mockResolvedValue({ id: 10 }) },
        ordemServico:     { update: jest.fn().mockResolvedValue({}) },
      };
      prisma.$transaction.mockImplementation((fn) => fn(tx));

      await servico.registrarServico(1, { descricao: 'Troca da placa-mãe', garantiaDias: '90' });

      expect(tx.servicoExecutado.create).toHaveBeenCalledTimes(1);
      expect(tx.ordemServico.update.mock.calls[0][0].data.status).toBe('EM_ANDAMENTO');
    });
  });

  describe('excluirServico', () => {
    test('bloqueia exclusão em OS finalizada', async () => {
      prisma.servicoExecutado.findUnique.mockResolvedValue({
        id: 5, ordemId: 1, ordem: { id: 1, status: 'FINALIZADO' },
      });

      await expect(servico.excluirServico(1, 5)).rejects.toThrow(/Não é possível excluir serviços/);
      expect(prisma.servicoExecutado.delete).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    test('bloqueia exclusão cruzada entre ordens', async () => {
      prisma.servicoExecutado.findUnique.mockResolvedValue({
        id: 5, ordemId: 1, ordem: { id: 1, status: 'EM_ANDAMENTO' },
      });

      await expect(servico.excluirServico(2, 5)).rejects.toThrow(/não pertence à ordem/);
    });
  });
});

/**
 * Backlog item 2 — quem executou (RN09) e o que acontece com as peças
 * vinculadas quando o serviço é excluído (RN12).
 */
describe('técnico do serviço e peças vinculadas', () => {
  beforeEach(() => jest.clearAllMocks());

  function transacaoServico() {
    const tx = {
      servicoExecutado: {
        create: jest.fn(async (args) => ({ id: 10, ...args.data })),
        delete: jest.fn(async () => ({})),
      },
      ordemServico: { update: jest.fn(async () => ({})) },
      itemOrdem:    { update: jest.fn(async () => ({})) },
    };
    prisma.$transaction.mockImplementation((fn) => fn(tx));
    return tx;
  }

  test('RN09: grava como técnico o usuário recebido da sessão', async () => {
    prisma.ordemServico.findUnique.mockResolvedValue({ id: 1, numero: 'OS-1', status: 'EM_ANDAMENTO' });
    const tx = transacaoServico();

    await servico.registrarServico(1, { descricao: 'Troca da tela' }, { id: 7, perfil: 'TECNICO' });

    expect(tx.servicoExecutado.create.mock.calls[0][0].data.usuarioId).toBe(7);
  });

  test('RN09: usuarioId vindo do formulário é ignorado', async () => {
    prisma.ordemServico.findUnique.mockResolvedValue({ id: 1, numero: 'OS-1', status: 'EM_ANDAMENTO' });
    const tx = transacaoServico();

    await servico.registrarServico(1, { descricao: 'Troca da tela', usuarioId: '99' }, { id: 7 });

    expect(tx.servicoExecutado.create.mock.calls[0][0].data.usuarioId).toBe(7);
  });

  test('RN09: sem usuário na chamada, o técnico fica nulo — nunca vem do corpo', async () => {
    prisma.ordemServico.findUnique.mockResolvedValue({ id: 1, numero: 'OS-1', status: 'EM_ANDAMENTO' });
    const tx = transacaoServico();

    await servico.registrarServico(1, { descricao: 'Troca da tela', usuarioId: '99' });

    expect(tx.servicoExecutado.create.mock.calls[0][0].data.usuarioId).toBeNull();
  });

  test('RN12: desvincula cada peça, uma a uma, antes de excluir — na mesma transação', async () => {
    prisma.servicoExecutado.findUnique.mockResolvedValue({
      id: 5, ordemId: 1, ordem: { id: 1, status: 'EM_ANDAMENTO' },
      itens: [{ id: 21 }, { id: 22 }],
    });
    const tx = transacaoServico();
    const ordem = [];
    tx.itemOrdem.update.mockImplementation(async (a) => { ordem.push(`update ${a.where.id}`); return {}; });
    tx.servicoExecutado.delete.mockImplementation(async () => { ordem.push('delete'); return {}; });

    const r = await servico.excluirServico(1, 5);

    expect(ordem).toEqual(['update 21', 'update 22', 'delete']);
    expect(tx.itemOrdem.update.mock.calls[0][0].data).toEqual({ servicoId: null });
    expect(r.desvinculadas).toBe(2);
  });

  test('RN12: serviço sem peças só é excluído', async () => {
    prisma.servicoExecutado.findUnique.mockResolvedValue({
      id: 5, ordemId: 1, ordem: { id: 1, status: 'EM_ANDAMENTO' }, itens: [],
    });
    const tx = transacaoServico();

    const r = await servico.excluirServico(1, 5);

    expect(tx.itemOrdem.update).not.toHaveBeenCalled();
    expect(tx.servicoExecutado.delete).toHaveBeenCalledTimes(1);
    expect(r.desvinculadas).toBe(0);
  });
});
