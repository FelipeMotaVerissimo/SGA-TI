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

  test('o CSP só autoriza uma origem externa: os tiles do mapa, em img-src', async () => {
    const res = await request(app).get('/login');
    const csp = res.headers['content-security-policy'];
    const externas = csp.split(';').map((d) => d.trim())
      .filter((d) => /https?:\/\//.test(d));

    expect(externas).toEqual(["img-src 'self' data: https://tile.openstreetmap.org"]);
  });

  test("o CSP não autoriza script embutido — script-src é só 'self'", async () => {
    const res = await request(app).get('/login');
    const scriptSrc = res.headers['content-security-policy']
      .split(';').map((d) => d.trim()).find((d) => d.startsWith('script-src'));

    expect(scriptSrc).toBe("script-src 'self'");
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

describe('confirmação de ações destrutivas sem script embutido', () => {
  test('a tela carrega o confirmar.js e marca os formulários com data-confirmar', async () => {
    const agente = await logar(request, app, 'admin');
    const res = await agente.get('/clientes');

    expect(res.status).toBe(200);
    expect(res.text).toContain('<script src="/js/confirmar.js" defer></script>');
    expect(res.text).toMatch(/action="\/clientes\/\d+\/excluir"[^>]*data-confirmar="Deseja remover este cliente\?"/);
    expect(res.text).not.toMatch(/\son(submit|click)=/);
  });

  test('a mensagem de anonimização leva o nome do cliente escapado, com apóstrofo e quebras de linha', async () => {
    // Regressão: no handler antigo a mensagem de várias linhas era erro de
    // sintaxe em JavaScript. O navegador descartava o handler e o formulário
    // de anonimização — irreversível — era enviado sem perguntar nada.
    const cliente = await prisma.cliente.create({
      data: { nome: "Joana D'Arc <b>", cpfCnpj: '999.888.777-66' },
    });
    const agente = await logar(request, app, 'admin');
    const res = await agente.get('/clientes');

    const re = new RegExp(
      `action="/clientes/${cliente.id}/anonimizar"[^>]*data-confirmar="([^"]*)"`);
    const mensagem = res.text.match(re)[1];

    expect(mensagem).toContain('Joana D&#39;Arc &lt;b&gt;');
    expect(mensagem).toMatch(/\r?\n.*APAGADOS/);
    expect(mensagem).toContain('NÃO pode ser desfeita.');
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

/**
 * NF007 — limite de tentativas de autenticação.
 *
 * Antes disto nada impedia força bruta contra `/login` e `/api/auth/login`.
 */
describe('limite de tentativas de login', () => {
  const { TENTATIVAS_LOGIN } = require('../../src/config/seguranca');

  /** Uma tentativa com senha errada. */
  const errar = (agente) =>
    agente.post('/login').type('form').send({ login: 'admin', senha: 'senha-errada' });

  test('erra até o limite e a próxima é barrada', async () => {
    const agente = request.agent(app);

    // O GET depois de cada tentativa não é enfeite: o connect-flash enfileira
    // as mensagens, e a tela mostra a primeira da fila. Sem consumir a cada
    // volta — como o navegador faz ao seguir o redirect — o teste leria a
    // mensagem de senha inválida da primeira tentativa, não a do limitador.
    for (let i = 0; i < TENTATIVAS_LOGIN; i += 1) {
      const r = await errar(agente);
      expect(r.headers.location).toBe('/login');

      const tela = await agente.get('/login');
      expect(tela.text).toMatch(/inválid/i);          // recusado pela senha
      expect(tela.text).not.toMatch(/Muitas tentativas/i);
    }

    // A seguinte é barrada pelo limitador, não mais pela senha.
    const barrada = await errar(agente);
    expect(barrada.headers.location).toBe('/login');

    const tela = await agente.get('/login');
    expect(tela.text).toMatch(/Muitas tentativas/i);
  });

  test('a API barrada devolve 429 em JSON, não HTML', async () => {
    for (let i = 0; i < TENTATIVAS_LOGIN; i += 1) {
      await request(app).post('/api/auth/login').send({ login: 'admin', senha: 'errada' });
    }

    const r = await request(app).post('/api/auth/login').send({ login: 'admin', senha: 'errada' });

    expect(r.status).toBe(429);
    expect(r.body.erro).toMatch(/Muitas tentativas/i);
  });

  test('login correto NÃO consome a cota', async () => {
    const agente = request.agent(app);

    // Muito mais logins válidos do que o limite permitiria se contassem.
    for (let i = 0; i < TENTATIVAS_LOGIN + 5; i += 1) {
      const r = await agente.post('/login').type('form')
        .send({ login: 'admin', senha: dados.SENHA });
      expect(r.headers.location).toBe('/dashboard');
    }

    // E uma tentativa errada depois disso ainda é tratada como senha errada,
    // não como excesso: a cota está intacta.
    const r = await errar(agente);
    expect(r.headers.location).toBe('/login');
    const tela = await agente.get('/login');
    expect(tela.text).not.toMatch(/Muitas tentativas/i);
  });
});

/**
 * NF007 — limite de tentativas na consulta pública de OS.
 *
 * A consulta não exige login e o número da OS tem só um milhão de
 * combinações. Sem limite, dava para varrer números e ler OS alheias.
 */
describe('limite de tentativas na consulta pública', () => {
  const { TENTATIVAS_CONSULTA, TENTATIVAS_LOGIN } = require('../../src/config/seguranca');

  const consultar = (numero) =>
    request(app).post('/consulta').type('form').send({ numero });

  test('erra até o limite e a próxima é barrada com 429', async () => {
    for (let i = 0; i < TENTATIVAS_CONSULTA; i += 1) {
      const r = await consultar(`OS-2026-${String(900000 + i)}`);
      expect(r.status).toBe(200);
      expect(r.text).toMatch(/não encontrada/i);
    }

    const barrada = await consultar('OS-2026-999999');
    expect(barrada.status).toBe(429);
    expect(barrada.text).toMatch(/Muitas consultas sem sucesso/);
  });

  test('consultar a própria OS várias vezes não consome o limite', async () => {
    const numero = dados.ordens.andamento.numero;

    for (let i = 0; i < TENTATIVAS_CONSULTA * 3; i += 1) {
      const r = await consultar(numero);
      expect(r.status).toBe(200);
      expect(r.text).toContain(numero);
    }

    // A cota de erros continua inteira: um erro ainda é tratado como erro.
    const r = await consultar('OS-2026-000000');
    expect(r.status).toBe(200);
    expect(r.text).toMatch(/não encontrada/i);
  });

  test('depois de estourar, até um número válido é barrado', async () => {
    for (let i = 0; i < TENTATIVAS_CONSULTA; i += 1) await consultar('OS-NAO-EXISTE');

    const r = await consultar(dados.ordens.andamento.numero);
    expect(r.status).toBe(429);
    expect(r.text).not.toContain(dados.ordens.andamento.defeitoRelatado);
  });

  test('a cota da consulta é separada da do login', async () => {
    for (let i = 0; i < TENTATIVAS_CONSULTA; i += 1) await consultar('OS-NAO-EXISTE');
    expect((await consultar('OS-NAO-EXISTE')).status).toBe(429);

    // O login, no mesmo IP, continua com a cota dele intacta.
    const login = await request(app).post('/login').type('form')
      .send({ login: 'admin', senha: dados.SENHA });
    expect(login.headers.location).toBe('/dashboard');
    expect(TENTATIVAS_LOGIN).toBeGreaterThan(0);
  });
});
