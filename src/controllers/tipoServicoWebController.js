const tipoServicoService = require('../services/tipoServicoService');

async function listar(req, res) {
  try {
    const incluirInativos = req.query.inativos === '1';
    const [tipos, usos] = await Promise.all([
      tipoServicoService.listar({ incluirInativos }),
      tipoServicoService.contarUsos(),
    ]);

    res.render('tipos-servico/listar', {
      titulo: 'Tipos de Serviço',
      tipos,
      usos,
      incluirInativos,
    });
  } catch (err) {
    req.flash('erro', err.message);
    res.redirect('/dashboard');
  }
}

function exibirForm(req, res) {
  res.render('tipos-servico/form', { titulo: 'Novo Tipo de Serviço', tipo: null });
}

async function criar(req, res) {
  try {
    await tipoServicoService.criar(req.body);
    req.flash('sucesso', 'Tipo de serviço cadastrado com sucesso!');
    res.redirect('/tipos-servico');
  } catch (err) {
    // Erro direto na view: um flash aqui só apareceria na requisição seguinte.
    res.render('tipos-servico/form', {
      titulo: 'Novo Tipo de Serviço',
      tipo:   req.body,
      erro:   [err.message],
    });
  }
}

async function exibirEditar(req, res) {
  try {
    const tipo = await tipoServicoService.buscarPorId(req.params.id);
    res.render('tipos-servico/form', { titulo: 'Editar Tipo de Serviço', tipo });
  } catch (err) {
    req.flash('erro', err.message);
    res.redirect('/tipos-servico');
  }
}

async function atualizar(req, res) {
  try {
    await tipoServicoService.atualizar(req.params.id, req.body);
    req.flash('sucesso', 'Tipo de serviço atualizado com sucesso!');
    res.redirect('/tipos-servico');
  } catch (err) {
    req.flash('erro', err.message);
    res.redirect(`/tipos-servico/${req.params.id}/editar`);
  }
}

async function desativar(req, res) {
  try {
    await tipoServicoService.desativar(req.params.id);
    req.flash('sucesso', 'Tipo desativado. Os serviços já registrados continuam com ele.');
  } catch (err) {
    req.flash('erro', err.message);
  }
  res.redirect('/tipos-servico');
}

async function reativar(req, res) {
  try {
    await tipoServicoService.reativar(req.params.id);
    req.flash('sucesso', 'Tipo de serviço reativado!');
  } catch (err) {
    req.flash('erro', err.message);
  }
  res.redirect('/tipos-servico?inativos=1');
}

module.exports = { listar, exibirForm, criar, exibirEditar, atualizar, desativar, reativar };
