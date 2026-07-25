const equipamentoService = require('../services/equipamentoService');
const clienteService     = require('../services/clienteService');

async function listar(req, res) {
  try {
    const equipamentos = await equipamentoService.listarEquipamentos();
    res.render('equipamentos/listar', { titulo: 'Equipamentos', equipamentos });
  } catch (err) {
    req.flash('erro', err.message);
    res.redirect('/dashboard');
  }
}

async function exibirForm(req, res) {
  try {
    const clientes = await clienteService.listarClientes();
    const clienteId = req.query.clienteId || null;
    res.render('equipamentos/form', { titulo: 'Novo Equipamento', equipamento: null, clientes, clienteId });
  } catch (err) {
    req.flash('erro', err.message);
    res.redirect('/equipamentos');
  }
}

async function criar(req, res) {
  try {
    await equipamentoService.criarEquipamento(req.body);
    req.flash('sucesso', 'Equipamento cadastrado com sucesso!');
    res.redirect('/equipamentos');
  } catch (err) {
    req.flash('erro', err.message);
    const clientes = await clienteService.listarClientes();
    res.render('equipamentos/form', { titulo: 'Novo Equipamento', equipamento: req.body, clientes, clienteId: req.body.clienteId });
  }
}

async function exibirEditar(req, res) {
  try {
    const equipamento = await equipamentoService.buscarEquipamentoPorId(req.params.id);
    const clientes    = await clienteService.listarClientes();
    res.render('equipamentos/form', { titulo: 'Editar Equipamento', equipamento, clientes, clienteId: equipamento.clienteId });
  } catch (err) {
    req.flash('erro', err.message);
    res.redirect('/equipamentos');
  }
}

async function atualizar(req, res) {
  try {
    await equipamentoService.atualizarEquipamento(req.params.id, req.body);
    req.flash('sucesso', 'Equipamento atualizado com sucesso!');
    res.redirect('/equipamentos');
  } catch (err) {
    req.flash('erro', err.message);
    res.redirect(`/equipamentos/${req.params.id}/editar`);
  }
}

module.exports = { listar, exibirForm, criar, exibirEditar, atualizar };