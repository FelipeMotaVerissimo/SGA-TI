const authService = require('../services/authService');

/**
 * Autentica e devolve o token.
 *
 * O campo é `login` — `Usuario` não tem `email`. Enquanto lia `req.body.email`,
 * esta rota passava `undefined` para o service e respondia sempre "Login e
 * senha obrigatórios", ou seja, era impossível obter um token pela API.
 * O `email` fica aceito como alternativa para não quebrar quem já chamava assim.
 */
async function login(req, res, next) {
  try {
    const identificador = req.body.login || req.body.email;
    res.json(await authService.login(identificador, req.body.senha));
  } catch (err) { next(err); }
}

async function criar(req, res, next) {
  try { res.status(201).json(await authService.criarUsuario(req.body)); }
  catch (err) { next(err); }
}

module.exports = { login, criar };