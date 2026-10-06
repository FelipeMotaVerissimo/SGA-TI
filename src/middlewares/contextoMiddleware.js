const contexto = require('../config/contextoRequisicao');

/**
 * NF005 — abre o contexto da requisição.
 *
 * Precisa ser montado **antes das rotas e depois da sessão**: a sessão é o que
 * identifica o usuário das telas. Para a API, quem completa a identidade é o
 * `authMiddleware`, que chama `definirUsuario` ao validar o token — por isso o
 * usuário aqui pode começar nulo e ser preenchido depois.
 *
 * O IP vem de `req.ip`. Atrás de proxy reverso isso devolve o IP do proxy, e
 * não o do cliente; em produção é preciso habilitar `trust proxy` para que o
 * Express leia o `X-Forwarded-For`. Fica registrado em docs/AUDITORIA.md.
 */
function contextoMiddleware(req, res, next) {
  const usuarioDaSessao = req.session && req.session.usuario;

  contexto.executarNoContexto(
    {
      usuarioId: usuarioDaSessao ? Number(usuarioDaSessao.id) : null,
      ip:        req.ip || (req.connection && req.connection.remoteAddress) || null,
    },
    next
  );
}

module.exports = { contextoMiddleware };
