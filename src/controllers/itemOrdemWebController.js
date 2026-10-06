const itemOrdemService = require('../services/itemOrdemService');

async function lancar(req, res) {
  try {
    const { aviso } = await itemOrdemService.lancarItem(
      req.params.id, req.body, req.session.usuario
    );

    req.flash('sucesso', 'Produto lançado na ordem de serviço e baixado do estoque!');
    if (aviso) req.flash('aviso', aviso);
  } catch (err) {
    req.flash('erro', err.message);
  }
  res.redirect(`/ordens/${req.params.id}`);
}

async function remover(req, res) {
  try {
    await itemOrdemService.removerItem(
      req.params.id, req.params.itemId, req.session.usuario
    );
    req.flash('sucesso', 'Produto removido da OS e devolvido ao estoque.');
  } catch (err) {
    req.flash('erro', err.message);
  }
  res.redirect(`/ordens/${req.params.id}`);
}

module.exports = { lancar, remover };
