jest.mock('../../src/config/database', () => ({
  ordemServico:   { findMany: jest.fn() },
  saidaEntrega:   { findUnique: jest.fn(), update: jest.fn() },
  entregaOS:      { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  posicaoEntrega: { findFirst: jest.fn(), create: jest.fn() },
  $transaction:   jest.fn(),
}));
jest.mock('../../src/services/geocodificacaoService', () => ({ geocodificar: jest.fn(async () => null) }));

const prisma  = require('../../src/config/database');
const entrega = require('../../src/services/entregaService');

/**
 * Módulo 6 — regras da saída de entrega (RN15 a RN25), com o Prisma simulado.
 * O fluxo com banco de verdade está em tests/integration/entregas.test.js.
 */

const ENTREGADOR = { id: 7, perfil: 'ENTREGADOR' };
const ADMIN      = { id: 1, perfil: 'ADMINISTRADOR' };
const OUTRO      = { id: 9, perfil: 'ENTREGADOR' };

beforeEach(() => jest.clearAllMocks());

describe('iniciarSaida', () => {
  const os = (id, status = 'FINALIZADO', entregas = []) => ({ id, numero: `OS-${id}`, status, entregas });

  test('RN17: sem OS não inicia', async () => {
    await expect(entrega.iniciarSaida([], ENTREGADOR)).rejects.toMatchObject({ status: 400 });
    await expect(entrega.iniciarSaida(undefined, ENTREGADOR)).rejects.toThrow(/ao menos uma OS/);
  });

  test('id inválido é recusado antes de consultar o banco', async () => {
    await expect(entrega.iniciarSaida(['abc'], ENTREGADOR)).rejects.toThrow(/inválida/);
    expect(prisma.ordemServico.findMany).not.toHaveBeenCalled();
  });

  test('RN15: OS não finalizada recusa tudo, sem abrir transação', async () => {
    prisma.ordemServico.findMany.mockResolvedValue([os(1), os(2, 'EM_ANDAMENTO')]);
    await expect(entrega.iniciarSaida([1, 2], ENTREGADOR)).rejects.toThrow(/OS-2 não está finalizada/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test('RN16: OS já entregue é recusada', async () => {
    prisma.ordemServico.findMany.mockResolvedValue([os(1, 'FINALIZADO', [{ status: 'ENTREGUE' }])]);
    await expect(entrega.iniciarSaida([1], ENTREGADOR)).rejects.toThrow(/já foi entregue/);
  });

  test('RN14: OS já pendente em outra entrega é recusada', async () => {
    prisma.ordemServico.findMany.mockResolvedValue([os(1, 'FINALIZADO', [{ status: 'PENDENTE' }])]);
    await expect(entrega.iniciarSaida([1], ENTREGADOR)).rejects.toThrow(/entrega em andamento/);
  });

  test('OS inexistente → 404', async () => {
    prisma.ordemServico.findMany.mockResolvedValue([os(1)]);
    await expect(entrega.iniciarSaida([1, 99], ENTREGADOR)).rejects.toMatchObject({ status: 404 });
  });

  test('RN13: o índice único do banco vira mensagem clara, com 409', async () => {
    prisma.ordemServico.findMany.mockResolvedValue([os(1)]);
    prisma.$transaction.mockRejectedValue(
      Object.assign(new Error('Unique'), { code: 'P2002', meta: { target: ['emRota'] } }));
    await expect(entrega.iniciarSaida([1], ENTREGADOR))
      .rejects.toMatchObject({ status: 409, message: expect.stringMatching(/Já existe uma saída em rota/) });
  });

  test('RN18: o entregador é o usuário recebido; ids repetidos viram uma parada', async () => {
    prisma.ordemServico.findMany.mockResolvedValue([os(3), os(1)]);
    const tx = {
      saidaEntrega: { create: jest.fn(async (a) => ({ id: 50, ...a.data })) },
      entregaOS:    { create: jest.fn(async (a) => a.data) },
    };
    prisma.$transaction.mockImplementation((fn) => fn(tx));
    prisma.saidaEntrega.findUnique.mockResolvedValue({ id: 50, entregas: [] });

    await entrega.iniciarSaida(['3', '1', '3'], ENTREGADOR);

    expect(tx.saidaEntrega.create.mock.calls[0][0].data).toEqual({ entregadorId: 7 });
    expect(tx.entregaOS.create.mock.calls.map((c) => c[0].data)).toEqual([
      { saidaId: 50, ordemId: 3, ordemParada: 1, ordemPendenteId: 3 },
      { saidaId: 50, ordemId: 1, ordemParada: 2, ordemPendenteId: 1 },
    ]);
  });
});

describe('posição', () => {
  test.each([
    [{ lat: 0, lng: 0 }, true], [{ lat: -90, lng: 180 }, true], [{ lat: 90, lng: -180, precisao: 0 }, true],
    [{ lat: 90.0001, lng: 0 }, false], [{ lat: 0, lng: -180.5 }, false], [{ lat: '', lng: 1 }, false],
    [{ lat: 1 }, false], [{ lat: 'NaN', lng: 1 }, false], [{ lat: 1, lng: 1, precisao: -1 }, false],
  ])('RN20: validarPosicao(%j) aceita? %p', (dados, aceita) => {
    if (aceita) expect(() => entrega.validarPosicao(dados)).not.toThrow();
    else expect(() => entrega.validarPosicao(dados)).toThrow();
  });

  test('RN19: sem saída em rota → 409; de outro usuário → 403', async () => {
    prisma.saidaEntrega.findUnique.mockResolvedValueOnce(null);
    await expect(entrega.registrarPosicao({ lat: 1, lng: 1 }, ENTREGADOR)).rejects.toMatchObject({ status: 409 });

    prisma.saidaEntrega.findUnique.mockResolvedValueOnce({ id: 5, entregadorId: 7 });
    await expect(entrega.registrarPosicao({ lat: 1, lng: 1 }, OUTRO)).rejects.toMatchObject({ status: 403 });
    expect(prisma.posicaoEntrega.create).not.toHaveBeenCalled();
  });

  test('RN21: a menos de 5 s é descartada; a 5 s em diante é gravada', async () => {
    const agora = new Date('2026-10-16T12:00:10Z');
    prisma.saidaEntrega.findUnique.mockResolvedValue({ id: 5, entregadorId: 7 });
    prisma.posicaoEntrega.create.mockImplementation(async (a) => a.data);

    prisma.posicaoEntrega.findFirst.mockResolvedValueOnce({ registradaEm: new Date('2026-10-16T12:00:06Z') });
    expect(await entrega.registrarPosicao({ lat: 1, lng: 1 }, ENTREGADOR, agora)).toEqual({ descartada: true });

    prisma.posicaoEntrega.findFirst.mockResolvedValueOnce({ registradaEm: new Date('2026-10-16T12:00:05Z') });
    const r = await entrega.registrarPosicao({ lat: 1, lng: 1 }, ENTREGADOR, agora);
    expect(r.descartada).toBe(false);
    expect(prisma.posicaoEntrega.create).toHaveBeenCalledTimes(1);
  });
});

describe('marcarEntrega', () => {
  const base = (extra = {}) => ({
    id: 11, status: 'PENDENTE', saida: { entregadorId: 7, status: 'EM_ROTA' }, ordem: { numero: 'OS-1' }, ...extra,
  });

  test('RN22: entregue limpa token e pendência', async () => {
    prisma.entregaOS.findUnique.mockResolvedValue(base());
    prisma.entregaOS.update.mockImplementation(async (a) => a.data);
    const r = await entrega.marcarEntrega(11, 'ENTREGUE', '', ENTREGADOR);
    expect(r).toMatchObject({ status: 'ENTREGUE', ordemPendenteId: null, tokenHash: null, motivo: null });
    expect(r.entregueEm).toBeInstanceOf(Date);
  });

  test('RN22: outro entregador não marca; o administrador marca', async () => {
    prisma.entregaOS.findUnique.mockResolvedValue(base());
    prisma.entregaOS.update.mockImplementation(async (a) => a.data);
    await expect(entrega.marcarEntrega(11, 'ENTREGUE', '', OUTRO)).rejects.toMatchObject({ status: 403 });
    await expect(entrega.marcarEntrega(11, 'ENTREGUE', '', ADMIN)).resolves.toBeDefined();
  });

  test('RN22: já marcada, ou de saída encerrada, é recusada', async () => {
    prisma.entregaOS.findUnique.mockResolvedValueOnce(base({ status: 'ENTREGUE' }));
    await expect(entrega.marcarEntrega(11, 'ENTREGUE', '', ENTREGADOR)).rejects.toThrow(/já foi marcada/);
    prisma.entregaOS.findUnique.mockResolvedValueOnce(base({ saida: { entregadorId: 7, status: 'CONCLUIDA' } }));
    await expect(entrega.marcarEntrega(11, 'ENTREGUE', '', ENTREGADOR)).rejects.toThrow(/já foi encerrada/);
    expect(prisma.entregaOS.update).not.toHaveBeenCalled();
  });

  test('RN23: não entregue exige motivo de 3 caracteres', async () => {
    prisma.entregaOS.findUnique.mockResolvedValue(base());
    prisma.entregaOS.update.mockImplementation(async (a) => a.data);
    await expect(entrega.marcarEntrega(11, 'NAO_ENTREGUE', '  ab ', ENTREGADOR)).rejects.toThrow(/motivo/);
    const r = await entrega.marcarEntrega(11, 'NAO_ENTREGUE', ' Ausente ', ENTREGADOR);
    expect(r).toMatchObject({ status: 'NAO_ENTREGUE', motivo: 'Ausente', entregueEm: null });
  });

  test('resultado desconhecido é recusado', async () => {
    await expect(entrega.marcarEntrega(11, 'PERDIDO', '', ENTREGADOR)).rejects.toThrow(/inválido/);
  });
});

describe('encerrar e cancelar', () => {
  test('RN24: com pendente não encerra, e a mensagem lista as OS', async () => {
    prisma.saidaEntrega.findUnique.mockResolvedValue({
      id: 5, entregadorId: 7,
      entregas: [{ status: 'ENTREGUE', ordem: { numero: 'OS-1' } }, { status: 'PENDENTE', ordem: { numero: 'OS-2' } }],
    });
    await expect(entrega.encerrarSaida(ENTREGADOR)).rejects.toThrow(/OS-2/);
    expect(prisma.saidaEntrega.update).not.toHaveBeenCalled();
  });

  test('RN24: sem pendente, conclui e solta o emRota', async () => {
    prisma.saidaEntrega.findUnique.mockResolvedValue({ id: 5, entregadorId: 7, entregas: [] });
    prisma.saidaEntrega.update.mockImplementation(async (a) => a.data);
    const r = await entrega.encerrarSaida(ENTREGADOR);
    expect(r).toMatchObject({ status: 'CONCLUIDA', emRota: null });
  });

  test('RN25: só o administrador cancela', async () => {
    await expect(entrega.cancelarSaida(5, ENTREGADOR)).rejects.toMatchObject({ status: 403 });
    expect(prisma.saidaEntrega.findUnique).not.toHaveBeenCalled();
  });

  test('RN25: pendentes viram não entregues; tokens de todas somem; entregue fica', async () => {
    prisma.saidaEntrega.findUnique.mockResolvedValue({
      id: 5, status: 'EM_ROTA',
      entregas: [
        { id: 1, status: 'ENTREGUE', tokenHash: null },
        { id: 2, status: 'PENDENTE', tokenHash: 'h' },
        { id: 3, status: 'NAO_ENTREGUE', tokenHash: 'h' },
      ],
    });
    const tx = { entregaOS: { update: jest.fn() }, saidaEntrega: { update: jest.fn(async (a) => a.data) } };
    prisma.$transaction.mockImplementation((fn) => fn(tx));

    const r = await entrega.cancelarSaida(5, ADMIN);

    const porId = Object.fromEntries(tx.entregaOS.update.mock.calls.map((c) => [c[0].where.id, c[0].data]));
    expect(porId[1]).toBeUndefined();                       // entregue, sem token: nada a mudar
    expect(porId[2]).toEqual({ status: 'NAO_ENTREGUE', motivo: 'Saída cancelada', ordemPendenteId: null, tokenHash: null });
    expect(porId[3]).toEqual({ tokenHash: null });
    expect(r).toMatchObject({ status: 'CANCELADA', emRota: null });
  });
});
