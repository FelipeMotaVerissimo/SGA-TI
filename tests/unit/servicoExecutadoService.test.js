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
    });

    test('bloqueia exclusão cruzada entre ordens', async () => {
      prisma.servicoExecutado.findUnique.mockResolvedValue({
        id: 5, ordemId: 1, ordem: { id: 1, status: 'EM_ANDAMENTO' },
      });

      await expect(servico.excluirServico(2, 5)).rejects.toThrow(/não pertence à ordem/);
    });
  });
});
