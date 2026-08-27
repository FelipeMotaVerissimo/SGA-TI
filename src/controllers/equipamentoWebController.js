const equipamentoService = require('../services/equipamentoService');
const clienteService     = require('../services/clienteService');
const { temPermissao }   = require('../middlewares/perfilMiddleware');

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
    // O erro vai direto para a view: um req.flash() aqui só apareceria na
    // requisição seguinte, porque res.locals.erro já foi resolvido no início
    // desta. O usuário via o formulário voltar sem explicação nenhuma.
    const clientes = await clienteService.listarClientes();
    res.render('equipamentos/form', {
      titulo: 'Novo Equipamento',
      equipamento: req.body,
      clientes,
      clienteId: req.body.clienteId,
      erro: [err.message],
    });
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

/**
 * RF012 — histórico de serviços do equipamento.
 *
 * O TECNICO alcança esta tela pelo detalhe da OS, mas não tem acesso à lista
 * de equipamentos (que é do ATENDENTE). Mandá-lo para /equipamentos num erro
 * só trocaria a mensagem por um "acesso negado" — daí o destino depender do
 * perfil.
 */
async function exibirHistorico(req, res) {
  try {
    const historico = await equipamentoService.historicoDeServicos(req.params.id);
    res.render('equipamentos/historico', {
      titulo: `Histórico — ${historico.equipamento.codigo}`,
      ...historico,
    });
  } catch (err) {
    req.flash('erro', err.message);
    const podeVerLista = temPermissao(req.session && req.session.usuario, ['ATENDENTE']);
    res.redirect(podeVerLista ? '/equipamentos' : '/dashboard');
  }
}

module.exports = { listar, exibirForm, criar, exibirEditar, atualizar, exibirHistorico };
