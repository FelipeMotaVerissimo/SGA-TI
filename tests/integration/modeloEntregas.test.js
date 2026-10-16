require('../helpers/ambiente'); // precisa vir antes de src/app

const request = require('supertest');
const app     = require('../../src/app');
const { semear, logar, prisma } = require('../helpers/fixture');

/**
 * Módulo 6 — modelo de dados das entregas (migration 8).
 *
 * Aqui se prova o que o BANCO garante, sem depender do código das telas, que
 * só chega na Etapa 3:
 *
 * | Regra | Como o banco garante |
 * |---|---|
 * | RN13 | Uma saída em rota por vez: `saidas_entrega.emRota` único, `true` só enquanto EM_ROTA |
 * | RN14 | Uma OS em uma só entrega pendente: `entregas_os.ordemPendenteId` único |
 * | —    | A mesma OS não aparece duas vezes na mesma saída: `@@unique([saidaId, ordemId])` |
 * | —    | Chaves `RESTRICT`: OS, saída e entregador com entrega não podem ser apagados |
 *
 * E o perfil ENTREGADOR, que só vai acessar as telas de entrega.
 */

let dados;

beforeEach(async () => { dados = await semear(); });
afterAll(async () => { await prisma.$disconnect(); });

const novaSaida = (extra = {}) =>
  prisma.saidaEntrega.create({ data: { entregadorId: dados.usuarios.entregador.id, ...extra } });

/** Encerra a saída como a Etapa 3 vai fazer: status final e emRota nulo. */
const encerrar = (saida) =>
  prisma.saidaEntrega.update({
    where: { id: saida.id },
    data:  { status: 'CONCLUIDA', emRota: null, encerradaEm: new Date() },
  });

const entregar = (saida, ordem, extra = {}) =>
  prisma.entregaOS.create({
    data: { saidaId: saida.id, ordemId: ordem.id, ordemParada: 1, ordemPendenteId: ordem.id, ...extra },
  });

describe('RN13 — uma saída em rota por vez', () => {
  test('a saída nasce EM_ROTA, com emRota = true', async () => {
    const saida = await novaSaida();
    expect(saida.status).toBe('EM_ROTA');
    expect(saida.emRota).toBe(true);
  });

  test('o banco recusa uma segunda saída em rota', async () => {
    await novaSaida();
    await expect(novaSaida()).rejects.toThrow();
    expect(await prisma.saidaEntrega.count()).toBe(1);
  });

  test('encerrada a primeira, uma nova pode sair — e o histórico guarda várias encerradas', async () => {
    await encerrar(await novaSaida());
    await encerrar(await novaSaida());
    const terceira = await novaSaida();

    expect(terceira.emRota).toBe(true);
    expect(await prisma.saidaEntrega.count({ where: { emRota: null } })).toBe(2);
  });
});

describe('RN14 — uma OS em uma só entrega pendente', () => {
  test('o banco recusa a mesma OS pendente em duas saídas', async () => {
    const os = dados.ordens.finalizado;
    const antiga = await novaSaida({ status: 'CONCLUIDA', emRota: null });
    await entregar(antiga, os);

    const atual = await novaSaida();
    await expect(entregar(atual, os)).rejects.toThrow();
  });

  test('depois de entregue (ordemPendenteId nulo), a OS pode sair de novo', async () => {
    const os = dados.ordens.finalizado;
    const antiga = await novaSaida({ status: 'CONCLUIDA', emRota: null });
    const entrega = await entregar(antiga, os);
    await prisma.entregaOS.update({
      where: { id: entrega.id },
      data:  { status: 'NAO_ENTREGUE', ordemPendenteId: null, motivo: 'Cliente ausente' },
    });

    const atual = await novaSaida();
    const nova = await entregar(atual, os);
    expect(nova.status).toBe('PENDENTE');
  });

  test('a mesma OS não aparece duas vezes na mesma saída', async () => {
    const os = dados.ordens.finalizado;
    const saida = await novaSaida();
    await entregar(saida, os, { ordemPendenteId: null, status: 'NAO_ENTREGUE' });

    await expect(entregar(saida, os)).rejects.toThrow();
  });

  test('o token é guardado só como hash, único', async () => {
    const saida = await novaSaida();
    const hash = 'a'.repeat(64);
    await entregar(saida, dados.ordens.finalizado, { tokenHash: hash });

    await expect(
      entregar(saida, dados.ordens.andamento, { tokenHash: hash })
    ).rejects.toThrow();
  });
});

describe('chaves RESTRICT', () => {
  test('não apaga a OS que tem entrega', async () => {
    await entregar(await novaSaida(), dados.ordens.finalizado);
    await expect(
      prisma.ordemServico.delete({ where: { id: dados.ordens.finalizado.id } })
    ).rejects.toThrow();
  });

  test('não apaga a saída que tem entregas ou posições', async () => {
    const comEntrega = await novaSaida();
    await entregar(comEntrega, dados.ordens.finalizado);
    await expect(prisma.saidaEntrega.delete({ where: { id: comEntrega.id } })).rejects.toThrow();

    await encerrar(comEntrega);
    const comPosicao = await novaSaida();
    await prisma.posicaoEntrega.create({ data: { saidaId: comPosicao.id, lat: -22.2211, lng: -54.8056 } });
    await expect(prisma.saidaEntrega.delete({ where: { id: comPosicao.id } })).rejects.toThrow();
  });

  test('não apaga o usuário que foi entregador', async () => {
    await novaSaida();
    await expect(
      prisma.usuario.delete({ where: { id: dados.usuarios.entregador.id } })
    ).rejects.toThrow();
  });

  test('a posição guarda 6 casas decimais (cerca de 11 cm)', async () => {
    const saida = await novaSaida();
    const p = await prisma.posicaoEntrega.create({
      data: { saidaId: saida.id, lat: -22.221134, lng: -54.805612, precisao: 8.5 },
    });
    expect(Number(p.lat)).toBeCloseTo(-22.221134, 6);
    expect(Number(p.lng)).toBeCloseTo(-54.805612, 6);
  });
});

describe('perfil ENTREGADOR', () => {
  test('existe e tem usuário na fixture', async () => {
    const perfil = await prisma.perfil.findUnique({ where: { nomePerfil: 'ENTREGADOR' } });
    expect(perfil).not.toBeNull();
    expect(dados.usuarios.entregador.perfilId).toBe(perfil.id);
  });

  test.each(['/clientes', '/equipamentos', '/ordens', '/produtos', '/financeiro', '/relatorios', '/usuarios', '/auditoria'])(
    'não acessa %s',
    async (rota) => {
      const entregador = await logar(request, app, 'entregador');
      const r = await entregador.get(rota);

      expect(r.status).toBe(302);
      expect(r.headers.location).toBe('/dashboard');
    }
  );
});
