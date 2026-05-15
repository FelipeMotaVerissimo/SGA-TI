const ordemServicoService = require('../services/ordemServicoService');

async function listar(req, res, next) {
  try { res.json(await ordemServicoService.listarOrdens(req.query)); }
  catch (err) { next(err); }
}

async function buscar(req, res, next) {
  try { res.json(await ordemServicoService.buscarOrdemPorId(req.params.id)); }
  catch (err) { next(err); }
}

async function abrir(req, res, next) {
  try { res.status(201).json(await ordemServicoService.abrirOrdem(req.body, req.usuario.id)); }
  catch (err) { next(err); }
}

async function atualizarStatus(req, res, next) {
  try { res.json(await ordemServicoService.atualizarStatus(req.params.id, req.body.status)); }
  catch (err) { next(err); }
}

async function registrarOrcamento(req, res, next) {
  try { res.json(await ordemServicoService.registrarOrcamento(req.params.id, req.body)); }
  catch (err) { next(err); }
}

module.exports = { listar, buscar, abrir, atualizarStatus, registrarOrcamento };