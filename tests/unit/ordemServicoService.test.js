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
});