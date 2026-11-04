require('../helpers/ambiente'); // precisa vir antes de src/app

const request = require('supertest');
const app     = require('../../src/app');
const { semear, logar, prisma } = require('../helpers/fixture');

/**
 * Fuso de Dourados nas telas antigas (fix/fuso-telas-antigas).
 *
 * A suíte roda em UTC (tests/globalSetup.js), como o servidor do Render. É aí
 * que uma data formatada sem fuso sai errada: um registro feito às 22:30 em
 * Dourados já é 02:30 do dia seguinte em UTC, e a tela mostrava o dia
 * seguinte. Na máquina de desenvolvimento, que está no fuso de Dourados, o
 * defeito não aparecia.
 *
 * O instante usado é 01/03/2027 02:30 UTC = 28/02/2027 22:30 em Dourados
 * (UTC−4). Cada tela precisa mostrar 28/02/2027 e nunca 01/03/2027. O ano de
 * 2027 evita coincidir com qualquer data da massa de teste, e deixa o registro
 * como o mais recente onde a tela ordena por data.
 */

const QUANDO = new Date('2027-03-01T02:30:00Z');
const DOURADOS = '28/02/2027';
const UTC      = '01/03/2027';

let dados;
beforeEach(async () => { dados = await semear(); });
afterAll(async () => { await prisma.$disconnect(); });

/** A tela mostra a data de Dourados e não a de UTC. */
function esperarDourados(texto) {
  expect(texto).toContain(DOURADOS);
  expect(texto).not.toContain(UTC);
}

test('a premissa: o processo dos testes está em UTC e os dois dias diferem', () => {
  expect(QUANDO.getHours()).toBe(2);
  expect(QUANDO.toLocaleDateString('pt-BR', { timeZone: 'America/Campo_Grande' })).toBe(DOURADOS);
  expect(QUANDO.toLocaleDateString('pt-BR', { timeZone: 'UTC' })).toBe(UTC);
});

describe('ordens de serviço', () => {
  beforeEach(async () => {
    await prisma.ordemServico.update({ where: { id: dados.ordens.inicial.id }, data: { dataAbertura: QUANDO } });
  });

  test('lista de OS', async () => {
    const res = await (await logar(request, app, 'atendente')).get('/ordens');
    expect(res.status).toBe(200);
    esperarDourados(res.text);
  });

  test('detalhe da OS (data de abertura)', async () => {
    const res = await (await logar(request, app, 'atendente')).get(`/ordens/${dados.ordens.inicial.id}`);
    expect(res.status).toBe(200);
    esperarDourados(res.text);
  });

  test('detalhe da OS (data de execução do serviço)', async () => {
    await prisma.servicoExecutado.update({ where: { id: dados.servicos.emGarantia.id }, data: { executadoEm: QUANDO } });
    const res = await (await logar(request, app, 'atendente')).get(`/ordens/${dados.ordens.andamento.id}`);
    expect(res.status).toBe(200);
    esperarDourados(res.text);
  });

  test('dashboard (OS recentes)', async () => {
    const res = await (await logar(request, app, 'admin')).get('/dashboard');
    expect(res.status).toBe(200);
    esperarDourados(res.text);
  });

  test('consulta pública (data de abertura e do serviço)', async () => {
    await prisma.ordemServico.update({ where: { id: dados.ordens.andamento.id }, data: { dataAbertura: QUANDO } });
    await prisma.servicoExecutado.update({ where: { id: dados.servicos.emGarantia.id }, data: { executadoEm: QUANDO } });
    const res = await request(app).post('/consulta').type('form').send({ numero: dados.ordens.andamento.numero });
    expect(res.status).toBe(200);
    esperarDourados(res.text);
  });
});

test('histórico do equipamento', async () => {
  await prisma.ordemServico.update({ where: { id: dados.ordens.inicial.id }, data: { dataAbertura: QUANDO } });
  const res = await (await logar(request, app, 'atendente')).get(`/equipamentos/${dados.equipamento.id}/historico`);
  expect(res.status).toBe(200);
  esperarDourados(res.text);
});

test('financeiro (vencimento)', async () => {
  await prisma.contaReceber.update({ where: { id: dados.contas.receberAberta.id }, data: { vencimento: QUANDO } });
  const res = await (await logar(request, app, 'financeiro')).get('/financeiro');
  expect(res.status).toBe(200);
  esperarDourados(res.text);
});

test('estoque (data e hora do movimento)', async () => {
  const mov = await prisma.movimentoEstoque.findFirst({ where: { produtoId: dados.produtos.normal.id } });
  await prisma.movimentoEstoque.update({ where: { id: mov.id }, data: { criadoEm: QUANDO } });
  const res = await (await logar(request, app, 'compras')).get(`/produtos/${dados.produtos.normal.id}/estoque`);
  expect(res.status).toBe(200);
  esperarDourados(res.text);
  expect(res.text).toContain('22:30'); // a hora também é a de Dourados, não 02:30
});

test('lista de clientes (data da anonimização)', async () => {
  await prisma.cliente.update({ where: { id: dados.cliente.id }, data: { anonimizadoEm: QUANDO } });
  const res = await (await logar(request, app, 'admin')).get('/clientes');
  expect(res.status).toBe(200);
  esperarDourados(res.text);
});

test('auditoria (data e hora do registro)', async () => {
  await prisma.logAuditoria.updateMany({ data: { criadoEm: QUANDO } });
  const res = await (await logar(request, app, 'admin')).get('/auditoria?de=2027-02-01&ate=2027-03-31');
  expect(res.status).toBe(200);
  expect(res.text).toContain(`${DOURADOS}, 22:30`);
  expect(res.text).not.toContain(`${UTC}, 02:30`);
});

test('o período do filtro aparece com os dias pedidos, sem voltar um dia', async () => {
  // Antes de a tela passar a mostrar o dia do calendário, o período saía com
  // um dia a menos num processo em UTC (meia-noite UTC = 20h do dia anterior).
  const admin = await logar(request, app, 'admin');
  const aud = await admin.get('/auditoria?de=2027-02-01&ate=2027-03-31');
  const textoAud = aud.text.replace(/\s+/g, ' ');
  expect(textoAud).toContain('01/02/2027');
  expect(textoAud).toContain('31/03/2027');

  const rel = await admin.get('/relatorios?de=2027-02-01&ate=2027-03-31');
  const textoRel = rel.text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  expect(textoRel).toContain('01/02/2027');
  expect(textoRel).toContain('31/03/2027');
});
