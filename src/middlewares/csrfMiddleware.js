const crypto = require('crypto');

/**
 * NF007 — proteção contra CSRF (falsificação de requisição entre sites).
 *
 * Sem isto, uma página de outro site poderia fazer o navegador de um usuário
 * logado enviar um formulário ao sistema — e o cookie de sessão iria junto. O
 * `sameSite=lax` do cookie já barra o caso comum; o token é a segunda camada,
 * e a que não depende do navegador.
 *
 * Padrão "synchronizer token": um valor aleatório por sessão, guardado na
 * sessão e repetido em cada formulário (campo `_csrf`) ou no cabeçalho
 * `X-CSRF-Token`. Outro site não consegue ler a página, logo não sabe o token.
 *
 * A regra vale para **requisição de escrita com usuário logado**. Ficam de
 * fora, por construção e não por lista de exceções:
 *
 *  - `GET`, `HEAD` e `OPTIONS`, que não alteram nada;
 *  - `POST /login`, que descarta a sessão anterior e cria outra;
 *  - `POST /consulta` e `POST /consulta/rastreio`, formulários públicos;
 *  - requisição sem usuário na sessão (`/login`, `/consulta`, sessão
 *    expirada): não há sessão para sequestrar, e as rotas protegidas já
 *    devolvem para o login no `sessaoMiddleware`;
 *  - a API `/api/*`, que autentica por JWT no cabeçalho `Authorization` — o
 *    navegador não o envia sozinho, então não há o que falsificar.
 */

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Token da sessão, criado na primeira vez que é pedido. */
function tokenDaSessao(req) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  return req.session.csrfToken;
}

/** Compara em tempo constante; tamanho diferente é recusa, não exceção. */
function tokenConfere(esperado, recebido) {
  if (typeof recebido !== 'string' || !esperado) return false;
  const a = Buffer.from(esperado);
  const b = Buffer.from(recebido);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function precisaDeToken(req) {
  if (METODOS_SEGUROS.has(req.method)) return false;
  if (req.originalUrl.startsWith('/api/')) return false;
  // O login troca a sessão inteira (regenerate), então não há o que
  // sequestrar. E o formulário de login só aparece para quem não está
  // logado, logo nunca tem token: exigir aqui recusaria a segunda aba.
  if (req.path === '/login') return false;
  // Consulta pública (Módulo 2) e verificação do mapa da entrega (Módulo 6):
  // formulários sem sessão, que nada mudam na sessão de quem estiver logado —
  // e o site atacante não consegue ler a resposta. Exigir o token aqui
  // recusava (403) o funcionário logado que usasse a consulta pública; achado
  // no navegador, porque os testes da consulta eram todos sem login.
  if (req.path === '/consulta' || req.path === '/consulta/rastreio') return false;
  return Boolean(req.session && req.session.usuario);
}

function csrfMiddleware(req, res, next) {
  // Só quem está logado vê formulário que precise do token.
  if (req.session && req.session.usuario) res.locals.csrfToken = tokenDaSessao(req);

  if (!precisaDeToken(req)) return next();

  const recebido = (req.body && req.body._csrf) || req.get('X-CSRF-Token');
  if (tokenConfere(req.session.csrfToken, recebido)) return next();

  return res.status(403).send(PAGINA_RECUSA);
}

/**
 * Página própria, e não flash + redirect: a ação foi recusada e o status 403
 * diz isso a quem olhar o log. O caso legítimo mais comum é formulário aberto
 * antes de a sessão ser renovada (a sessão vive em memória e cai a cada
 * reinício do servidor).
 */
const PAGINA_RECUSA = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Formulário expirado — SGA TI</title>
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  <div class="conteudo" style="margin-left:0; max-width:560px">
    <div class="page-header">
      <h1>Formulário expirado</h1>
      <p>A ação não foi executada. Volte, recarregue a página e tente de novo.</p>
    </div>
    <a href="/dashboard" class="btn btn-primary">Ir para o dashboard</a>
  </div>
</body>
</html>`;

module.exports = { csrfMiddleware, tokenDaSessao, tokenConfere };
