const authService = require('../services/authService');

async function login(req, res, next) {
  try { res.json(await authService.login(req.body.email, req.body.senha)); }
  catch (err) { next(err); }
}

async function criar(req, res, next) {
  try { res.status(201).json(await authService.criarUsuario(req.body)); }
  catch (err) { next(err); }
}

module.exports = { login, criar };