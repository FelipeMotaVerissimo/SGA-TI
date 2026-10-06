/**
 * Módulo 4 — Controle de acesso por perfil (RF022 / RF023).
 *
 * Até o Módulo 3 qualquer usuário autenticado podia executar qualquer ação
 * (pendência P06). Aqui cada rota passa a declarar quais perfis podem usá-la.
 *
 * Regras:
 *  - ADMINISTRADOR passa em tudo (na entrevista, "Administrador e Gerência"
 *    respondem pelo sistema inteiro).
 *  - Os demais perfis só passam se estiverem na lista da rota.
 *  - Sem sessão, o usuário é mandado para o login (mesma resposta do
 *    sessaoMiddleware, para o caso de a rota ser usada isoladamente).
 */

const PERFIS = [
  'ADMINISTRADOR',
  'ATENDENTE',
  'TECNICO',
  'VENDEDOR',
  'FINANCEIRO',
  'COMPRAS',
];

const PERFIL_TOTAL = 'ADMINISTRADOR';

/** Regra pura — usada tanto pelo middleware quanto pelas views (sidebar). */
function temPermissao(usuario, perfisPermitidos = []) {
  if (!usuario || !usuario.perfil) return false;
  if (usuario.perfil === PERFIL_TOTAL) return true;
  return perfisPermitidos.includes(usuario.perfil);
}

/**
 * Devolve o middleware que protege a rota.
 * Uso: router.get('/produtos', sessaoMiddleware, exigirPerfil('COMPRAS'), ctrl.listar)
 */
function exigirPerfil(...perfisPermitidos) {
  return function (req, res, next) {
    const usuario = req.session && req.session.usuario;

    if (!usuario) {
      req.flash('erro', 'Faça login para acessar o sistema.');
      return res.redirect('/login');
    }

    if (temPermissao(usuario, perfisPermitidos)) return next();

    const lista = [PERFIL_TOTAL, ...perfisPermitidos].join(', ');
    req.flash(
      'erro',
      `Acesso negado: seu perfil (${usuario.perfil}) não pode executar esta ação. ` +
      `Perfis autorizados: ${lista}.`
    );
    return res.redirect('/dashboard');
  };
}

/**
 * Mesma regra, para as rotas de API.
 *
 * Aqui o usuário vem do token JWT (`req.usuario`, posto pelo authMiddleware),
 * não da sessão, e a resposta é JSON — nada de redirect para o dashboard.
 */
function exigirPerfilApi(...perfisPermitidos) {
  return function (req, res, next) {
    const usuario = req.usuario;

    if (!usuario) return res.status(401).json({ erro: 'Token não fornecido.' });

    if (temPermissao(usuario, perfisPermitidos)) return next();

    return res.status(403).json({
      erro: `Perfil ${usuario.perfil} não pode executar esta ação.`,
      perfisAutorizados: [PERFIL_TOTAL, ...perfisPermitidos],
    });
  };
}

module.exports = { PERFIS, PERFIL_TOTAL, temPermissao, exigirPerfil, exigirPerfilApi };
