jest.mock('../../src/config/database', () => ({
  ordemServico:   { findMany: jest.fn() },
  saidaEntrega:   { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
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

describe('painel do administrador', () => {
  const entregaOS = (id, parada, status, lat = '-22.221134', lng = '-54.805612') => ({
    id, ordemParada: parada, status, destinoLat: lat, destinoLng: lng,
    ordem: { numero: `OS-${id}`, equipamento: { cliente: { nome: 'Fulano', telefone: '67999990000' } } },
  });

  test('resumirSaida conta as paradas por resultado', () => {
    const r = entrega.resumirSaida({
      id: 4, status: 'CONCLUIDA', iniciadaEm: 'i', encerradaEm: 'f', entregador: { id: 7, nome: 'Zé' },
      // Contagens diferentes entre si, para uma troca de status não passar.
      entregas: [
        { status: 'ENTREGUE' }, { status: 'NAO_ENTREGUE' }, { status: 'NAO_ENTREGUE' },
        { status: 'PENDENTE' }, { status: 'PENDENTE' }, { status: 'PENDENTE' },
      ],
    });
    expect(r).toEqual({
      id: 4, status: 'CONCLUIDA', iniciadaEm: 'i', encerradaEm: 'f', entregador: { id: 7, nome: 'Zé' },
      totalOS: 6, entregues: 1, naoEntregues: 2, pendentes: 3,
    });
  });

  test('listarHistorico pede as mais novas, com o teto de 50', async () => {
    prisma.saidaEntrega.findMany.mockResolvedValue([]);
    await entrega.listarHistorico();
    const args = prisma.saidaEntrega.findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual({ iniciadaEm: 'desc' });
    expect(args.take).toBe(50);
    expect(entrega.LIMITE_HISTORICO).toBe(50);
  });

  test('RN34: destinosDoMapa leva só as paradas geocodificadas e só os campos do mapa', () => {
    const d = entrega.destinosDoMapa([
      entregaOS(1, 1, 'ENTREGUE'),
      entregaOS(2, 2, 'PENDENTE', null, null),
      entregaOS(3, 3, 'PENDENTE'),
    ]);
    expect(d).toEqual([
      { id: 1, parada: 1, os: 'OS-1', lat: -22.221134, lng: -54.805612, status: 'ENTREGUE' },
      { id: 3, parada: 3, os: 'OS-3', lat: -22.221134, lng: -54.805612, status: 'PENDENTE' },
    ]);
    expect(JSON.stringify(d)).not.toMatch(/Fulano|67999990000/);
  });

  test('montarPainel converte a posição e não leva campos extras', () => {
    const p = entrega.montarPainel(
      { id: 5, status: 'EM_ROTA', entregas: [{ id: 1, status: 'ENTREGUE', motivo: 'x' }] },
      { lat: '-22.23', lng: '-54.81', registradaEm: 't', precisao: 8 },
    );
    expect(p).toEqual({
      saidaId: 5, status: 'EM_ROTA',
      posicao: { lat: -22.23, lng: -54.81, atualizadoEm: 't' },
      entregas: [{ id: 1, status: 'ENTREGUE' }],
    });
    expect(entrega.montarPainel({ id: 5, status: 'EM_ROTA', entregas: [] }, null).posicao).toBeNull();
  });

  test('RN33: painelPosicao sem saída em rota devolve null sem buscar posição', async () => {
    prisma.saidaEntrega.findUnique.mockResolvedValue(null);
    expect(await entrega.painelPosicao()).toBeNull();
    expect(prisma.saidaEntrega.findUnique.mock.calls[0][0].where).toEqual({ emRota: true });
    expect(prisma.posicaoEntrega.findFirst).not.toHaveBeenCalled();
  });

  test('painelPosicao busca a última posição da saída em rota', async () => {
    prisma.saidaEntrega.findUnique.mockResolvedValue({ id: 5, status: 'EM_ROTA', entregas: [] });
    prisma.posicaoEntrega.findFirst.mockResolvedValue({ lat: '-22.2', lng: '-54.8', registradaEm: 't' });
    const p = await entrega.painelPosicao();
    const args = prisma.posicaoEntrega.findFirst.mock.calls[0][0];
    expect(args.where).toEqual({ saidaId: 5 });
    expect(args.orderBy).toEqual({ registradaEm: 'desc' });
    expect(p.posicao).toEqual({ lat: -22.2, lng: -54.8, atualizadoEm: 't' });
  });
});
