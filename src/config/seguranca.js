/**
 * NF007 — segurança na comunicação.
 *
 * Reúne num lugar só as decisões de transporte: cabeçalhos, política de
 * conteúdo, cookie de sessão, CORS e redirecionamento para HTTPS.
 *
 * **Regra que guiou tudo: nada pode quebrar o ambiente local em HTTP.** Por
 * isso cada proteção que exige TLS é ligada apenas quando `NODE_ENV` é
 * `production`. Em desenvolvimento o sistema continua subindo em
 * `http://localhost:3000` sem nenhum ajuste.
 */

/** Único ponto que decide se estamos em produção. */
function emProducao() {
  return process.env.NODE_ENV === 'production';
}

/**
 * Política de Segurança de Conteúdo.
 *
 * `'unsafe-inline'` aparece duas vezes, e as duas são dívida conhecida, não
 * descuido:
 *
 *  - **estilos:** as views usam `style="..."` em dezenas de pontos, além das
 *    classes do `style.css`;
 *  - **scripts:** há dois blocos `<script>` embutidos (`ordens/form.ejs` e
 *    `produtos/estoque.ejs`) e onze handlers `onclick` nas listagens, quase
 *    todos `return confirm(...)`.
 *
 * Remover a permissão exigiria mover handlers e scripts para um arquivo em
 * `/public/js`, o que é o caminho correto e está registrado como pendência em
 * `docs/SEGURANCA.md`. Ligar o CSP mesmo assim já fecha o que importa: o
 * sistema não carrega script, estilo, frame ou fonte de **nenhuma origem
 * externa**, e não pode ser embutido em iframe de terceiro.
 */
const DIRETIVAS_CSP = {
  defaultSrc: ["'self'"],
  scriptSrc:  ["'self'", "'unsafe-inline'"],
  styleSrc:   ["'self'", "'unsafe-inline'"],
  imgSrc:     ["'self'", 'data:'],
  fontSrc:    ["'self'"],
  connectSrc: ["'self'"],
  formAction: ["'self'"],
  // Ninguém embute o sistema num iframe: defesa contra clickjacking.
  frameAncestors: ["'none'"],
  frameSrc:   ["'none'"],
  objectSrc:  ["'none'"],
  baseUri:    ["'self'"],
};

/**
 * `upgrade-insecure-requests` manda o navegador trocar toda requisição HTTP por
 * HTTPS. Em produção é o que se quer; em `http://localhost` **quebra o sistema
 * inteiro** — o navegador tenta falar TLS com um servidor que não tem TLS e
 * devolve `ERR_SSL_PROTOCOL_ERROR`.
 *
 * Isto não é hipótese: aconteceu. O `helmet` mescla as diretivas informadas com
 * as dele por padrão, e `upgrade-insecure-requests` está entre as padrão. A
 * tela de clientes carregava, mas qualquer requisição seguinte morria. Por isso
 * `useDefaults: false`: o que vai no cabeçalho é exatamente a lista acima, sem
 * surpresa de versão da biblioteca.
 */
function diretivasDoAmbiente() {
  const diretivas = { ...DIRETIVAS_CSP };
  if (emProducao()) diretivas.upgradeInsecureRequests = [];
  return diretivas;
}

/** Opções do `helmet`. */
function opcoesHelmet() {
  return {
    contentSecurityPolicy: {
      useDefaults: false,
      directives:  diretivasDoAmbiente(),
    },

    // HSTS só faz sentido sob HTTPS. Enviado em HTTP é ignorado pelo navegador,
    // mas mandá-lo em desenvolvimento é pior que inútil: se alguém abrir o
    // sistema em `localhost` e o cabeçalho pegar, o navegador passa a exigir
    // HTTPS em localhost e o ambiente para de funcionar — inclusive para outros
    // projetos na mesma máquina.
    hsts: emProducao()
      ? { maxAge: 180 * 24 * 60 * 60, includeSubDomains: true, preload: false }
      : false,

    // O navegador não deve adivinhar o tipo do conteúdo servido.
    noSniff: true,
    // Não vazar a URL interna do sistema ao navegar para fora.
    referrerPolicy: { policy: 'same-origin' },
  };
}

/**
 * Origens autorizadas a chamar a API, lidas de `CORS_ORIGINS`
 * (lista separada por vírgula).
 *
 * As telas são servidas pelo próprio Express, então são sempre same-origin e
 * não dependem disto. O CORS existe só para a API `/api/*`.
 */
function origensPermitidas() {
  const bruto = String(process.env.CORS_ORIGINS || '').trim();
  if (!bruto) return [];
  return bruto.split(',').map((o) => o.trim()).filter(Boolean);
}

/**
 * Opções do `cors`.
 *
 * Antes era `cors()` puro, que responde `Access-Control-Allow-Origin: *` para
 * qualquer um. Agora:
 *
 *  - com `CORS_ORIGINS` definido, só aquelas origens passam;
 *  - sem a variável, **nenhuma origem cruzada** é autorizada. Requisições sem
 *    cabeçalho `Origin` (Postman, curl, servidor para servidor) continuam
 *    passando, porque não são requisições de navegador e o CORS não as governa.
 */
function opcoesCors() {
  const permitidas = origensPermitidas();

  return {
    origin(origem, callback) {
      if (!origem) return callback(null, true);        // sem Origin: não é CORS
      if (permitidas.includes(origem)) return callback(null, true);
      return callback(null, false);                     // nega sem derrubar
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  };
}

/**
 * Configuração do cookie de sessão.
 *
 * Antes só havia `maxAge`. O que entrou:
 *
 *  - `httpOnly` — o cookie deixa de ser legível por JavaScript, o que tira o
 *    roubo de sessão do alcance de um XSS. Era o padrão do `express-session`,
 *    mas um padrão implícito não é uma decisão documentada;
 *  - `sameSite: 'lax'` — o cookie não acompanha requisições vindas de outro
 *    site, o que barra CSRF nos POSTs do sistema sem quebrar a navegação normal
 *    nem os links externos;
 *  - `secure` em produção — o cookie só trafega sob HTTPS. Em desenvolvimento
 *    fica `false`, senão nenhuma sessão funcionaria em `http://localhost`.
 */
function opcoesCookieSessao() {
  return {
    maxAge:   8 * 60 * 60 * 1000, // 8 horas
    httpOnly: true,
    sameSite: 'lax',
    secure:   emProducao(),
  };
}

/**
 * Redireciona HTTP para HTTPS, só em produção.
 *
 * Em hospedagem gratuita (Render, Railway, Fly.io) o TLS termina no proxy da
 * plataforma, e a aplicação recebe a requisição em HTTP com o protocolo
 * original no cabeçalho `X-Forwarded-Proto`. Por isso a verificação olha o
 * cabeçalho, e não só `req.secure`.
 *
 * `trust proxy` precisa estar ligado para que o Express leia esse cabeçalho —
 * o que, de quebra, faz `req.ip` devolver o IP real do cliente e resolve a
 * pendência P02 do NF005, em que a auditoria gravava o IP do proxy.
 */
function redirecionarParaHttps(req, res, next) {
  if (!emProducao()) return next();
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') return next();

  // 301 e não 302: é permanente, e o navegador passa a ir direto no HTTPS.
  return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
}

module.exports = {
  emProducao,
  DIRETIVAS_CSP,
  diretivasDoAmbiente,
  opcoesHelmet,
  origensPermitidas,
  opcoesCors,
  opcoesCookieSessao,
  redirecionarParaHttps,
};
