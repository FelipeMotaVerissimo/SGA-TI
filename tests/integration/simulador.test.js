require('../helpers/ambiente'); // precisa vir antes de src/app

const request = require('supertest');
const app     = require('../../src/app');
const { semear, logar, prisma } = require('../helpers/fixture');
const { aguardarGravacoes } = require('../../src/services/auditoriaExtensao');
const sim = require('../../scripts/simular-entrega');

/**
 * Módulo 6 — simulador de entrega contra o banco de verdade. A espera entre
 * os pontos é trocada por uma função que não espera (ou que age no meio,
 * como alguém cancelando a saída na tela).
 */

let dados;
beforeEach(async () => { dados = await semear(); });
afterAll(async () => { await prisma.$disconnect(); });

const PONTOS = [
  { lat: -22.221573, lng: -54.805541, parada: null },
  { lat: -22.222000, lng: -54.800000, parada: 1 },
  { lat: -22.223571, lng: -54.772547, parada: null },
];
const semEspera = async () => {};
const calado = () => {};

/** O entregador inicia a saída pela tela, como na demonstração. */
async function saidaEmRota() {
  const entregador = await logar(request, app, 'entregador');
  await entregador.post('/entregas/saida').type('form').send({ ordemIds: [String(dados.ordens.finalizado.id)] });
  return prisma.saidaEntrega.findUnique({ where: { emRota: true }, include: { entregas: true } });
}

test('grava os pontos do trajeto, em ordem, na saída em rota', async () => {
  const saida = await saidaEmRota();
  const r = await sim.simular({ prisma, pontos: PONTOS, dormir: semEspera, log: calado });

  expect(r).toEqual({ gravadas: 3, motivo: 'fim-do-trajeto' });
  const gravadas = await prisma.posicaoEntrega.findMany({ where: { saidaId: saida.id }, orderBy: { id: 'asc' } });
  expect(gravadas.map((p) => [Number(p.lat), Number(p.lng)])).toEqual(PONTOS.map((p) => [p.lat, p.lng]));
});

test('sem saída em rota, não grava nada', async () => {
  await expect(sim.simular({ prisma, pontos: PONTOS, dormir: semEspera, log: calado }))
    .rejects.toThrow(/Não há saída em rota/);
  expect(await prisma.posicaoEntrega.count()).toBe(0);
});

test('a saída cancelada no meio pelo administrador interrompe a simulação', async () => {
  const saida = await saidaEmRota();
  const admin = await logar(request, app, 'admin');
  let passos = 0;
  const cancelaNoSegundo = async () => {
    passos++;
    if (passos === 2) await admin.post(`/entregas/saidas/${saida.id}/cancelar`).send({});
  };

  const r = await sim.simular({ prisma, pontos: PONTOS, dormir: cancelaNoSegundo, log: calado });
  expect(r).toEqual({ gravadas: 2, motivo: 'saida-fora-de-rota' });
  expect(await prisma.posicaoEntrega.count({ where: { saidaId: saida.id } })).toBe(2);
});

test('as posições simuladas não entram na auditoria', async () => {
  await saidaEmRota();
  await sim.simular({ prisma, pontos: PONTOS, dormir: semEspera, log: calado });
  await aguardarGravacoes();

  expect(await prisma.posicaoEntrega.count()).toBe(3);
  expect(await prisma.logAuditoria.count({ where: { entidade: 'PosicaoEntrega' } })).toBe(0);
});

test('o painel do administrador mostra a última posição simulada', async () => {
  await saidaEmRota();
  await sim.simular({ prisma, pontos: PONTOS, dormir: semEspera, log: calado });

  const r = await (await logar(request, app, 'admin')).get('/entregas/painel/posicao');
  expect(r.status).toBe(200);
  expect(r.body.posicao.lat).toBeCloseTo(-22.223571, 6);
  expect(r.body.posicao.lng).toBeCloseTo(-54.772547, 6);
});

test('o trajeto de demonstração inteiro roda contra o banco', async () => {
  const saida = await saidaEmRota();
  const pontos = sim.carregarTrajeto(sim.TRAJETO_PADRAO);
  const r = await sim.simular({ prisma, pontos, dormir: semEspera, log: calado });

  expect(r.gravadas).toBe(pontos.length);
  expect(await prisma.posicaoEntrega.count({ where: { saidaId: saida.id } })).toBe(pontos.length);
});
