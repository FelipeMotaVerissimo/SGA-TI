const clienteService = require('../services/clienteService');

async function listar(req, res, next) {
  try { res.json(await clienteService.listarClientes()); }
  catch (err) { next(err); }
}

async function buscar(req, res, next) {
  try { res.json(await clienteService.buscarClientePorId(req.params.id)); }
  catch (err) { next(err); }
}

async function criar(req, res, next) {
  try { res.status(201).json(await clienteService.criarCliente(req.body)); }
  catch (err) { next(err); }
}

async function atualizar(req, res, next) {
  try { res.json(await clienteService.atualizarCliente(req.params.id, req.body)); }
  catch (err) { next(err); }
}

async function excluir(req, res, next) {
  try { await clienteService.excluirCliente(req.params.id); res.status(204).send(); }
  catch (err) { next(err); }
}

module.exports = { listar, buscar, criar, atualizar, excluir };