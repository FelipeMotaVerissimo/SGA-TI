const clienteService = require('../services/clienteService');

async function listar(req, res) {
  try {
    const clientes = await clienteService.listarClientes();
    res.render('clientes/listar', { titulo: 'Clientes', clientes });
  } catch (err) {
    req.flash('erro', err.message);
    res.redirect('/dashboard');
  }
}

async function exibirForm(req, res) {
  res.render('clientes/form', { titulo: 'Novo Cliente', cliente: null });
}

async function criar(req, res) {
  try {
    await clienteService.criarCliente(req.body);
    req.flash('sucesso', 'Cliente cadastrado com sucesso!');
    res.redirect('/clientes');
  } catch (err) {
    req.flash('erro', err.message);
    res.render('clientes/form', { titulo: 'Novo Cliente', cliente: req.body });
  }
}

async function exibirEditar(req, res) {
  try {
    const cliente = await clienteService.buscarClientePorId(req.params.id);
    res.render('clientes/form', { titulo: 'Editar Cliente', cliente });
  } catch (err) {
    req.flash('erro', err.message);
    res.redirect('/clientes');
  }
}

async function atualizar(req, res) {
  try {
    await clienteService.atualizarCliente(req.params.id, req.body);
    req.flash('sucesso', 'Cliente atualizado com sucesso!');
    res.redirect('/clientes');
  } catch (err) {
    req.flash('erro', err.message);
    res.redirect(`/clientes/${req.params.id}/editar`);
  }
}

async function excluir(req, res) {
  try {
    await clienteService.excluirCliente(req.params.id);
    req.flash('sucesso', 'Cliente removido com sucesso!');
    res.redirect('/clientes');
  } catch (err) {
    req.flash('erro', err.message);
    res.redirect('/clientes');
  }
}

module.exports = { listar, exibirForm, criar, exibirEditar, atualizar, excluir };