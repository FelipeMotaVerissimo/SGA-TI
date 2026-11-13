require('../helpers/ambiente'); // precisa vir antes de src/app

const request = require('supertest');
const app     = require('../../src/app');
const { semear, logar, prisma } = require('../helpers/fixture');

/**
 * S3/S4 — injeção de SQL e de script (XSS armazenado e refletido).
 *
 * Cada campo de texto das entidades principais recebe um "veneno": um script,
 * um atributo de evento e um trecho de SQL. Depois todas as telas que mostram
 * esses dados são abertas, e a resposta não pode trazer o veneno cru — só a
 * versão escapada (`&lt;script&gt;`). O SQL tem de ser gravado como texto
 * comum, sem apagar nem alterar nada.
 */

const SCRIPT = '<script>alert("xss")</script>';
const EVENTO = '"><img src=x onerror=alert(1)>';
const SQL    = "'; DROP TABLE clientes; --";
const VENENO = `${SCRIPT}${EVENTO}${SQL}`;

/** Trechos que, se aparecerem crus no HTML, executariam no navegador. */
const CRUS = ['<script>alert("xss")', '<img src=x onerror'];

let dados;
let ordem;

beforeAll(async () => {
  dados = await semear();

  await prisma.cliente.update({
    where: { id: dados.cliente.id },
    data: {
      nome: `Cliente ${VENENO}`.slice(0, 150), endereco: VENENO, bairro: VENENO.slice(0, 100),
      cidade: VENENO.slice(0, 100), email: VENENO.slice(0, 150),
    },
  });
  await prisma.equipamento.update({
    where: { id: dados.equipamento.id },
    data: { marca: VENENO.slice(0, 100), modelo: VENENO.slice(0, 100), defeito: VENENO },
  });
  ordem = dados.ordens.andamento;
  await prisma.ordemServico.update({
    where: { id: ordem.id }, data: { defeitoRelatado: VENENO, observacoes: VENENO },
  });
  await prisma.servicoExecutado.update({
    where: { id: dados.servicos.emGarantia.id }, data: { descricao: VENENO, observacoes: VENENO },
  });
  await prisma.produto.update({
    where: { id: dados.produtos.normal.id }, data: { nome: VENENO.slice(0, 150), descricao: VENENO },
  });
  await prisma.contaReceber.create({
    data: { descricao: VENENO.slice(0, 200), valor: '10.00', vencimento: new Date(), observacoes: VENENO },
  });
  await prisma.contaPagar.create({
    data: {
      descricao: VENENO.slice(0, 200), fornecedor: VENENO.slice(0, 150),
      valor: '10.00', vencimento: new Date(), observacoes: VENENO,
    },
  });
}, 60000);

afterAll(async () => { await prisma.$disconnect(); });

function semVenenoCru(html) {
  for (const cru of CRUS) expect(html).not.toContain(cru);
}

describe('S4 — XSS armazenado: telas internas (administrador)', () => {
  const telas = () => [
    '/dashboard', '/clientes', `/clientes/${dados.cliente.id}/editar`,
    '/equipamentos', `/equipamentos/${dados.equipamento.id}/editar`,
    `/equipamentos/${dados.equipamento.id}/historico`,
    '/ordens', `/ordens/${ordem.id}`,
    '/produtos', `/produtos/${dados.produtos.normal.id}/editar`,
    `/produtos/${dados.produtos.normal.id}/estoque`,
    '/financeiro', '/relatorios', '/auditoria',
  ];

  test('nenhuma tela traz o script cru, e o texto aparece escapado', async () => {
    const admin = await logar(request, app, 'admin');
    const vistos = [];
    for (const tela of telas()) {
      const r = await admin.get(tela);
      expect({ tela, status: r.status }).toEqual({ tela, status: 200 });
      semVenenoCru(r.text);
      if (r.text.includes('&lt;script&gt;alert(')) vistos.push(tela);
    }
    // Prova de que o veneno chegou às telas (e não foi só ignorado):
    expect(vistos).toEqual(expect.arrayContaining(['/clientes', `/ordens/${ordem.id}`, '/produtos', '/financeiro']));
  });
});

describe('S4 — XSS na consulta pública (sem login)', () => {
  test('o resultado da consulta mostra os dados escapados', async () => {
    const r = await request(app).post('/consulta').type('form').send({ numero: ordem.numero });
    expect(r.status).toBe(200);
    semVenenoCru(r.text);
    expect(r.text).toContain('&lt;script&gt;');
  });

  test('o número digitado volta escapado (XSS refletido)', async () => {
    const r = await request(app).post('/consulta').type('form').send({ numero: SCRIPT });
    semVenenoCru(r.text);
  });
});

describe('S3 — SQL injetado é só texto', () => {
  test('o banco gravou o texto como veio e nenhuma tabela sumiu', async () => {
    const cliente = await prisma.cliente.findUnique({ where: { id: dados.cliente.id } });
    expect(cliente.endereco).toBe(VENENO);
    expect(await prisma.cliente.count()).toBeGreaterThan(0);
  });

  test.each([
    ['/clientes?busca=', 'admin'],
    ['/ordens?busca=', 'admin'],
    ['/produtos?busca=', 'admin'],
    ['/auditoria?tabela=', 'admin'],
  ])('busca %s com SQL não quebra nem vaza erro do banco', async (rota, login) => {
    const agente = await logar(request, app, login);
    for (const termo of [SQL, "' OR '1'='1", '1; SELECT * FROM usuarios', '%', '_']) {
      const r = await agente.get(rota + encodeURIComponent(termo));
      expect([200, 302]).toContain(r.status);
      expect(r.text).not.toMatch(/prisma|SQLITE|syntax error|ER_PARSE/i);
    }
  });
});
