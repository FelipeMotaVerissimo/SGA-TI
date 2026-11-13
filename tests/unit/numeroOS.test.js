jest.mock('../../src/config/database', () => ({
  ordemServico: { create: jest.fn() },
  $transaction: jest.fn(),
}));

const prisma              = require('../../src/config/database');
const ordemServicoService = require('../../src/services/ordemServicoService');

/**
 * Número da OS repetido (bateria da 6ª Etapa, 13/11/2026): os 6 últimos dígitos
 * do relógio se repetem a cada 16 min 40 s e no mesmo milissegundo. A abertura
 * passa a tentar outro número quando o banco recusa o repetido.
 */

const DADOS = { defeitoRelatado: 'Não liga', equipamentoId: 1 };
const repetido = () => Object.assign(new Error('Unique constraint failed on the fields: (`numero`)'),
  { code: 'P2002', meta: { target: 'ordens_servico_numero_key' } });

beforeEach(() => jest.clearAllMocks());

test('número repetido: tenta outro e abre a OS', async () => {
  prisma.ordemServico.create
    .mockRejectedValueOnce(repetido())
    .mockImplementation(async (a) => ({ id: 2, ...a.data }));

  const os = await ordemServicoService.abrirOrdem(DADOS, 1);

  expect(prisma.ordemServico.create).toHaveBeenCalledTimes(2);
  const [n1, n2] = prisma.ordemServico.create.mock.calls.map((c) => c[0].data.numero);
  expect(n2).toMatch(/^OS-\d{4}-\d{6}$/);
  expect(os.numero).toBe(n2);
  expect(n1).toMatch(/^OS-\d{4}-\d{6}$/);
});

test('sem número livre após 5 tentativas: mensagem amigável, sem detalhe do banco', async () => {
  prisma.ordemServico.create.mockRejectedValue(repetido());

  const err = await ordemServicoService.abrirOrdem(DADOS, 1).catch((e) => e);

  expect(prisma.ordemServico.create).toHaveBeenCalledTimes(5);
  expect(err.status).toBe(503);
  expect(err.message).toBe('Não foi possível gerar um número livre para a OS. Tente novamente.');
});

test('outro erro do banco não é repetido nem mascarado', async () => {
  const fk = Object.assign(new Error('Foreign key constraint failed'), { code: 'P2003' });
  prisma.ordemServico.create.mockRejectedValue(fk);

  await expect(ordemServicoService.abrirOrdem(DADOS, 1)).rejects.toBe(fk);
  expect(prisma.ordemServico.create).toHaveBeenCalledTimes(1);
});
