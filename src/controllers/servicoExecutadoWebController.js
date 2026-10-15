const servicoExecutadoService = require('../services/servicoExecutadoService');

/**
 * Módulo 3 (parte 2) — Serviços Executados e Garantia
 * Segue o mesmo padrão dos demais controllers web do projeto:
 * try/catch + req.flash + redirect para a tela de origem.
 */

async function registrar(req, res) {
  try {
    // RN09: quem executou é quem está logado — vem da sessão, nunca do formulário.
    await servicoExecutadoService.registrarServico(req.params.id, req.body, req.session.usuario);
    req.flash('sucesso', 'Serviço executado registrado com sucesso!');
  } catch (err) {
    req.flash('erro', err.message);
  }
  res.redirect(`/ordens/${req.params.id}`);
}

async function excluir(req, res) {
  try {
    const { desvinculadas } =
      await servicoExecutadoService.excluirServico(req.params.id, req.params.servicoId);
    req.flash('sucesso', 'Serviço executado removido.');
    // RN12: as peças ficam na OS; o usuário precisa saber que perderam o vínculo.
    if (desvinculadas > 0) {
      req.flash('aviso', `${desvinculadas} peça(s) desvinculada(s) do serviço. Continuam na OS como uso geral.`);
    }
  } catch (err) {
    req.flash('erro', err.message);
  }
  res.redirect(`/ordens/${req.params.id}`);
}

module.exports = {
  registrar,
  excluir,
};
