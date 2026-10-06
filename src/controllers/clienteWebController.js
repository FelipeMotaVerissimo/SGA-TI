const clienteService = require('../services/clienteService');
const retencaoService = require('../services/retencaoService'); // NF008

async function listar(req, res) {
  try {
    const incluirInativos = req.query.inativos === '1';
    const clientes = await clienteService.listarClientes({ incluirInativos });
    res.render('clientes/listar', { titulo: 'Clientes', clientes, incluirInativos });
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
    console.log('BODY RECEBIDO:', req.body);
    await clienteService.criarCliente(req.body);
    req.flash('sucesso', 'Cliente cadastrado com sucesso!');
    res.redirect('/clientes');
  } catch (err) {
    console.log('ERRO:', err.message);
    req.flash('erro', err.message);
    res.render('clientes/form', { titulo: 'Novo Cliente', cliente: null });
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

/**
 * NF008 — anonimização a pedido do titular (art. 18 da LGPD).
 *
 * Operação irreversível, por isso restrita ao administrador na rota e com
 * confirmação na tela.
 */
async function anonimizar(req, res) {
  try {
    const vinculo = await retencaoService.resumoDoVinculo(req.params.id);
    await retencaoService.anonimizarCliente(req.params.id);
    req.flash(
      'sucesso',
      'Dados pessoais apagados. Preservados: ' +
      `${vinculo.ordens} ordem(ns) de serviço, ${vinculo.equipamentos} equipamento(s) ` +
      `e ${vinculo.contas} conta(s) a receber.`
    );
  } catch (err) {
    req.flash('erro', err.message);
  }
  res.redirect('/clientes?inativos=1');
}

module.exports = { listar, exibirForm, criar, exibirEditar, atualizar, excluir, anonimizar };