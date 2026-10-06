require('../helpers/ambiente'); // precisa vir antes de src/app

const request = require('supertest');
const app     = require('../../src/app');
const { semear, logar, prisma } = require('../helpers/fixture');

/**
 * NF007 — segurança na comunicação, verificada no que a aplicação **de fato
 * responde**, não no que o módulo de configuração promete.
 *
 * A suíte roda com `NODE_ENV=test`, ou seja, fora de produção. É de propósito:
 * o requisito diz que nada pode quebrar o ambiente local em HTTP, então o que
 * precisa ficar provado aqui é que as proteções que exigem TLS estão
 * **desligadas** e o sistema continua funcionando.
 */

let dados;

beforeEach(async () => { dados = await semear(); });
afterAll(async () => { await prisma.$disconnect(); });

describe('cabeçalhos de segurança', () => {
  test('a resposta traz Content-Security-Policy — antes era desligado', async () => {
    const res = await request(app).get('/login');

    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
  });

  test('o CSP impede embutir o sistema em iframe de terceiro', async () => {
    const res = await request(app).get('/login');

    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
  });

  test('o CSP não autoriza nenhuma origem externa', async () => {
    const res = await request(app).get('/login');

    expect(res.headers['content-security-policy']).not.toMatch(/https?:\/\/[a-z]/i);
  });

  test('fora de produção o CSP NÃO manda o navegador forçar HTTPS', async () => {
    // Regressão: o helmet mescla as diretivas dele com as informadas, e
    // `upgrade-insecure-requests` vem nas padrão. Em http://localhost isso
    // derruba o sistema com ERR_SSL_PROTOCOL_ERROR. Pego no navegador, não aqui.
    const res = await request(app).get('/login');

    expect(res.headers['content-security-policy']).not.toContain('upgrade-insecure-requests');
  });

  test('X-Content-Type-Options evita o navegador adivinhar o tipo', async () => {
    const res = await request(app).get('/login');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  test('a versão do Express não é anunciada', async () => {
    const res = await request(app).get('/login');

    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  test('fora de produção NÃO envia HSTS', async () => {
    // Enviar em localhost faria o navegador passar a exigir HTTPS ali e
    // derrubaria o ambiente de desenvolvimento.
    const res = await request(app).get('/login');

    expect(res.headers['strict-transport-security']).toBeUndefined();
  });

  test('fora de produção o sistema continua respondendo em HTTP', async () => {
    const res = await request(app).get('/login');

    expect(res.status).toBe(200);
    expect(res.text).toContain('SGA TI');
  });
});

describe('cookie de sessão', () => {
  test('o cookie é HttpOnly e SameSite=Lax', async () => {
    const agente = request.agent(app);
    const res = await agente.post('/login').type('form')
      .send({ login: 'admin', senha: dados.SENHA });

    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  test('fora de produção o cookie NÃO é Secure — senão o login em http não funcionaria', async () => {
    const agente = request.agent(app);
    const res = await agente.post('/login').type('form')
      .send({ login: 'admin', senha: dados.SENHA });

    expect(String(res.headers['set-cookie'])).not.toMatch(/Secure/i);
  });

  test('a sessão continua funcionando ponta a ponta', async () => {
    const agente = await logar(request, app, 'admin');
    const res = await agente.get('/dashboard');

    expect(res.status).toBe(200);
  });
});

describe('CORS', () => {
  test('origem externa não recebe autorização', async () => {
    const res = await request(app).get('/api/produtos')
      .set('Origin', 'https://invasor.com');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  test('requisição sem Origin continua atendida — não é requisição de navegador', async () => {
    // Sem token dá 401, que é o controle de acesso agindo; o que importa aqui é
    // que o CORS não derrubou a requisição antes disso.
    const res = await request(app).get('/api/produtos');

    expect(res.status).toBe(401);
  });
});
