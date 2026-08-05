const servicoExecutadoService = require('../services/servicoExecutadoService');

/**
 * Módulo 3 (parte 2) — Serviços Executados e Garantia
 * Segue o mesmo padrão dos demais controllers web do projeto:
 * try/catch + req.flash + redirect para a tela de origem.
 */

async function registrar(req, res) {
  try {
    await servicoExecutadoService.registrarServico(req.params.id, req.body);
    req.flash('sucesso', 'Serviço executado registrado com sucesso!');
  } catch (err) {
    req.flash('erro', err.message);
  }
  res.redirect(`/ordens/${req.params.id}`);
}

async function excluir(req, res) {
  try {
    await servicoExecutadoService.excluirServico(req.params.id, req.params.servicoId);
    req.flash('sucesso', 'Serviço executado removido.');
  } catch (err) {
    req.flash('erro', err.message);
  }
  res.redirect(`/ordens/${req.params.id}`);
}

module.exports = {
  registrar,
  excluir,
};
