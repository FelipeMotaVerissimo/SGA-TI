require('../helpers/ambiente'); // precisa vir antes de src/app

const request = require('supertest');
const app     = require('../../src/app');
const { semear, logar, lerTokenCsrf, prisma, SENHA } = require('../helpers/fixture');

/**
 * NF007 — token CSRF, ponta a ponta: sessão, formulário e banco de verdade.
 *
 * Aqui o agente é montado à mão (`entrar`), sem o `logar()` da fixture, que
 * já manda o token sozinho — o que se quer provar é justamente o que acontece
 * sem ele.
 *
 * A ação usada é desativar um tipo de serviço: só administrador, reversível,
 * e o efeito é um campo simples de conferir no banco.
 */

let dados;

beforeEach(async () => { dados = await semear(); });
afterAll(async () => { await prisma.$disconnect(); });

async function entrar(login = 'admin') {
  const agente = request.agent(app);
  const r = await agente.post('/login').type('form').send({ login, senha: SENHA });
  expect(r.headers.location).toBe('/dashboard');
  return agente;
}

const ativo = async (id) => (await prisma.tipoServico.findUnique({ where: { id } })).ativo;

describe('escrita com usuário logado', () => {
  test('sem token: 403, e nada muda no banco', async () => {
    const agente = await entrar();
    const id = dados.tiposServico.tela.id;

    const r = await agente.post(`/tipos-servico/${id}/desativar`).type('form').send({});

    expect(r.status).toBe(403);
    expect(r.text).toMatch(/Formulário expirado/);
    expect(await ativo(id)).toBe(true);
  });

  test('token errado: 403, e nada muda no banco', async () => {
    const agente = await entrar();
    const id = dados.tiposServico.tela.id;

    const r = await agente.post(`/tipos-servico/${id}/desativar`).type('form')
      .send({ _csrf: 'f'.repeat(64) });

    expect(r.status).toBe(403);
    expect(await ativo(id)).toBe(true);
  });

  test('token de OUTRA sessão: 403 — o token não vale fora da sessão dele', async () => {
    const vitima  = await entrar();
    const atacante = await entrar();
    const tokenDoAtacante = await lerTokenCsrf(atacante);
    const id = dados.tiposServico.tela.id;

    const r = await vitima.post(`/tipos-servico/${id}/desativar`).type('form')
      .send({ _csrf: tokenDoAtacante });

    expect(r.status).toBe(403);
    expect(await ativo(id)).toBe(true);
  });

  test('token da página no campo _csrf: a ação acontece', async () => {
    const agente = await entrar();
    const token = await lerTokenCsrf(agente);
    const id = dados.tiposServico.tela.id;

    const r = await agente.post(`/tipos-servico/${id}/desativar`).type('form')
      .send({ _csrf: token });

    expect(r.status).toBe(302);
    expect(await ativo(id)).toBe(false);
  });

  test('token no cabeçalho X-CSRF-Token também vale', async () => {
    const agente = await entrar();
    const token = await lerTokenCsrf(agente);
    const id = dados.tiposServico.tela.id;

    await agente.post(`/tipos-servico/${id}/desativar`).set('X-CSRF-Token', token).send({});

    expect(await ativo(id)).toBe(false);
  });

  test('o fixture logar() manda o token sozinho', async () => {
    const agente = await logar(request, app, 'admin');
    const id = dados.tiposServico.tela.id;

    await agente.post(`/tipos-servico/${id}/desativar`).type('form').send({});

    expect(await ativo(id)).toBe(false);
  });
});

describe('o token na tela', () => {
  test('o formulário da tela leva o mesmo token da barra lateral', async () => {
    const agente = await entrar();
    const token = await lerTokenCsrf(agente);
    const tela = await agente.get('/tipos-servico');

    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const tokens = [...tela.text.matchAll(/name="_csrf" value="([^"]*)"/g)].map((m) => m[1]);
    expect(tokens.length).toBeGreaterThan(1);           // "Sair" + desativar
    expect(new Set(tokens)).toEqual(new Set([token]));
  });

  test('o login regenera a sessão: o token de antes não vale depois', async () => {
    const agente = await entrar();
    const antes = await lerTokenCsrf(agente);

    await agente.post('/login').type('form').send({ login: 'admin', senha: SENHA });
    const depois = await lerTokenCsrf(agente);
    expect(depois).not.toBe(antes);

    const id = dados.tiposServico.tela.id;
    const r = await agente.post(`/tipos-servico/${id}/desativar`).type('form')
      .send({ _csrf: antes });
    expect(r.status).toBe(403);
    expect(await ativo(id)).toBe(true);
  });

  test('o login troca o cookie de sessão', async () => {
    const agente = request.agent(app);
    await agente.get('/login');
    const cookie = (r) => (r.headers['set-cookie'] || []).find((c) => c.startsWith('connect.sid='));

    // Uma sessão anônima existe antes do login (o flash de erro a cria)...
    const errado = await agente.post('/login').type('form').send({ login: 'admin', senha: 'x' });
    const anterior = cookie(errado);
    expect(anterior).toBeDefined();

    // ...e o login bem-sucedido entrega outra.
    const certo = await agente.post('/login').type('form').send({ login: 'admin', senha: SENHA });
    const nova = cookie(certo);
    expect(nova).toBeDefined();
    expect(nova.split(';')[0]).not.toBe(anterior.split(';')[0]);
  });
});

describe('sair', () => {
  test('GET /logout não existe mais — um link não derruba a sessão', async () => {
    const agente = await entrar();
    await agente.get('/logout');

    const r = await agente.get('/dashboard');
    expect(r.status).toBe(200);
  });

  test('POST /logout sem token: 403, e a sessão continua', async () => {
    const agente = await entrar();
    const r = await agente.post('/logout').type('form').send({});

    expect(r.status).toBe(403);
    expect((await agente.get('/dashboard')).status).toBe(200);
  });

  test('POST /logout com token: sai', async () => {
    const agente = await entrar();
    const token = await lerTokenCsrf(agente);

    const r = await agente.post('/logout').type('form').send({ _csrf: token });
    expect(r.headers.location).toBe('/login');

    const depois = await agente.get('/dashboard');
    expect(depois.headers.location).toBe('/login');
  });
});

describe('o que não precisa de token continua funcionando', () => {
  test('login', async () => {
    const r = await request(app).post('/login').type('form')
      .send({ login: 'admin', senha: SENHA });
    expect(r.headers.location).toBe('/dashboard');
  });

  test('consulta pública', async () => {
    const os = await prisma.ordemServico.findFirst();
    const r = await request(app).post('/consulta').type('form').send({ numero: os.numero });
    expect(r.status).toBe(200);
  });

  test('API com JWT', async () => {
    const login = await request(app).post('/api/auth/login')
      .send({ login: 'admin', senha: SENHA });
    const r = await request(app).post('/api/clientes')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({ nome: 'Cliente via API', cpfCnpj: '555.666.777-88' });

    expect(r.status).toBe(201);
  });

  test('escrita sem sessão segue indo para o login, não para o 403', async () => {
    const id = dados.tiposServico.tela.id;
    const r = await request(app).post(`/tipos-servico/${id}/desativar`).type('form').send({});

    expect(r.headers.location).toBe('/login');
    expect(await ativo(id)).toBe(true);
  });
});
