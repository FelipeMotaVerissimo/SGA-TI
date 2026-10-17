/**
 * NF007 — token CSRF.
 *
 * O middleware é testado aqui com requisição e resposta de mentira, para
 * cobrir cada ramo da regra sem subir a aplicação. A prova ponta a ponta,
 * com sessão e banco de verdade, está em `tests/integration/csrf.test.js`.
 */

const fs   = require('fs');
const path = require('path');
const { csrfMiddleware, tokenDaSessao, tokenConfere } =
  require('../../src/middlewares/csrfMiddleware');

const USUARIO = { id: 1, nome: 'Admin', perfil: 'ADMINISTRADOR' };

function requisicao({ metodo = 'POST', url = '/clientes/1/excluir', usuario = USUARIO,
                      token, corpo = {}, cabecalho } = {}) {
  return {
    method: metodo,
    originalUrl: url,
    path: url.split('?')[0],
    session: { usuario, csrfToken: token },
    body: corpo,
    get: (nome) => (nome.toLowerCase() === 'x-csrf-token' ? cabecalho : undefined),
  };
}

function resposta() {
  const res = { locals: {} };
  res.status = jest.fn(() => res);
  res.send   = jest.fn(() => res);
  return res;
}

/** Roda o middleware e diz se a requisição seguiu ou foi recusada. */
function rodar(req) {
  const res = resposta();
  const next = jest.fn();
  csrfMiddleware(req, res, next);
  return { seguiu: next.mock.calls.length === 1, status: res.status.mock.calls[0]?.[0], res };
}

const TOKEN = 'a'.repeat(64);

describe('geração do token', () => {
  test('64 caracteres hexadecimais, o mesmo durante toda a sessão', () => {
    const req = { session: {} };
    const t1 = tokenDaSessao(req);
    const t2 = tokenDaSessao(req);

    expect(t1).toMatch(/^[0-9a-f]{64}$/);
    expect(t2).toBe(t1);
  });

  test('sessões diferentes recebem tokens diferentes', () => {
    expect(tokenDaSessao({ session: {} })).not.toBe(tokenDaSessao({ session: {} }));
  });

  test('o token vai para res.locals de quem está logado, e não de quem não está', () => {
    const logado = rodar(requisicao({ metodo: 'GET' }));
    const anonimo = rodar(requisicao({ metodo: 'GET', usuario: null }));

    expect(logado.res.locals.csrfToken).toMatch(/^[0-9a-f]{64}$/);
    expect(anonimo.res.locals.csrfToken).toBeUndefined();
  });
});

describe('comparação', () => {
  test('igual confere; diferente, ausente ou de outro tipo não', () => {
    expect(tokenConfere(TOKEN, TOKEN)).toBe(true);
    expect(tokenConfere(TOKEN, 'b'.repeat(64))).toBe(false);
    expect(tokenConfere(TOKEN, undefined)).toBe(false);
    expect(tokenConfere(TOKEN, ['x'])).toBe(false);
    expect(tokenConfere(undefined, TOKEN)).toBe(false);
  });

  test('tamanho diferente é recusa, não exceção', () => {
    // timingSafeEqual lança com buffers de tamanhos diferentes.
    expect(() => tokenConfere(TOKEN, 'a')).not.toThrow();
    expect(tokenConfere(TOKEN, 'a')).toBe(false);
  });
});

describe('quando o token é exigido', () => {
  test.each(['GET', 'HEAD', 'OPTIONS'])('%s passa sem token', (metodo) => {
    expect(rodar(requisicao({ metodo, token: TOKEN })).seguiu).toBe(true);
  });

  test('escrita sem usuário logado passa — quem barra é o sessaoMiddleware', () => {
    expect(rodar(requisicao({ usuario: null })).seguiu).toBe(true);
  });

  test('a API (JWT no cabeçalho) passa sem token', () => {
    expect(rodar(requisicao({ url: '/api/clientes', token: TOKEN })).seguiu).toBe(true);
  });

  test('o login passa sem token — ele troca a sessão inteira', () => {
    expect(rodar(requisicao({ url: '/login', token: TOKEN })).seguiu).toBe(true);
  });

  test('a consulta pública e a verificação do mapa passam sem token, mesmo logado', () => {
    expect(rodar(requisicao({ url: '/consulta', token: TOKEN })).seguiu).toBe(true);
    expect(rodar(requisicao({ url: '/consulta/rastreio', token: TOKEN })).seguiu).toBe(true);
  });

  test.each(['POST', 'PUT', 'PATCH', 'DELETE'])('%s logado sem token: 403', (metodo) => {
    const r = rodar(requisicao({ metodo, token: TOKEN }));
    expect(r.seguiu).toBe(false);
    expect(r.status).toBe(403);
  });

  test('token errado: 403', () => {
    const r = rodar(requisicao({ token: TOKEN, corpo: { _csrf: 'b'.repeat(64) } }));
    expect(r.status).toBe(403);
  });

  test('token de tamanho diferente: 403, sem derrubar a requisição', () => {
    const r = rodar(requisicao({ token: TOKEN, corpo: { _csrf: 'curto' } }));
    expect(r.status).toBe(403);
  });

  test('token certo no campo _csrf do formulário: passa', () => {
    expect(rodar(requisicao({ token: TOKEN, corpo: { _csrf: TOKEN } })).seguiu).toBe(true);
  });

  test('token certo no cabeçalho X-CSRF-Token: passa', () => {
    expect(rodar(requisicao({ token: TOKEN, cabecalho: TOKEN })).seguiu).toBe(true);
  });
});

/**
 * O middleware só ajuda se o formulário mandar o token. Um formulário novo
 * sem o parcial daria 403 só no navegador — esta varredura pega antes.
 */
describe('todo formulário POST autenticado leva o token', () => {
  const RAIZ = path.join(__dirname, '..', '..');
  const SEM_SESSAO = ['views/auth/login.ejs', 'views/ordens/consulta-publica.ejs'];

  function arquivos(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return arquivos(p);
      return p.endsWith('.ejs') ? [p] : [];
    });
  }
  const nome = (p) => path.relative(RAIZ, p).split(path.sep).join('/');

  /** Cada `<form method="POST">` com o trecho até o `</form>`. */
  function formulariosPost(texto) {
    return [...texto.matchAll(/<form\b[\s\S]*?<\/form>/gi)]
      .map((m) => m[0])
      .filter((f) => /method="post"/i.test(f.slice(0, f.indexOf('>', f.indexOf('method')))));
  }

  const views = arquivos(path.join(RAIZ, 'views'))
    .filter((p) => !SEM_SESSAO.includes(nome(p)));

  test('existem formulários POST a conferir', () => {
    const total = views.reduce((n, p) => n + formulariosPost(fs.readFileSync(p, 'utf8')).length, 0);
    expect(total).toBeGreaterThanOrEqual(30);
  });

  test('nenhum formulário POST sem o parcial csrf', () => {
    const faltando = views.flatMap((p) =>
      formulariosPost(fs.readFileSync(p, 'utf8'))
        .filter((f) => !/include\(['"](\.\.\/partials\/)?csrf['"]\)/.test(f))
        .map((f) => `${nome(p)}: ${f.split('\n')[0].trim()}`));

    expect(faltando).toEqual([]);
  });

  test('as duas telas sem sessão de fato não têm o parcial', () => {
    // Se um dia passarem a ter, a exceção acima perde o sentido.
    for (const p of SEM_SESSAO) {
      expect(fs.readFileSync(path.join(RAIZ, p), 'utf8')).not.toMatch(/partials\/csrf/);
    }
  });
});
