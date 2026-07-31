const ordemServicoService = require('../services/ordemServicoService');
const equipamentoService  = require('../services/equipamentoService');
const clienteService      = require('../services/clienteService');

async function listar(req, res) {
  try {
    const filtros = {};
    if (req.query.status) filtros.status = req.query.status;
    const ordens = await ordemServicoService.listarOrdens(filtros);
    res.render('ordens/listar', { titulo: 'Ordens de Serviço', ordens, filtroStatus: req.query.status || '' });
  } catch (err) {
    req.flash('erro', err.message);
    res.redirect('/dashboard');
  }
}

async function exibirDetalhe(req, res) {
  try {
    const ordem = await ordemServicoService.buscarOrdemPorId(req.params.id);
    res.render('ordens/detalhe', { titulo: `OS ${ordem.numero}`, ordem });
  } catch (err) {
    req.flash('erro', err.message);
    res.redirect('/ordens');
  }
}

async function exibirForm(req, res) {
  try {
    const clientes = await clienteService.listarClientes();
    res.render('ordens/form', { titulo: 'Abrir Ordem de Serviço', clientes, equipamentos: [] });
  } catch (err) {
    req.flash('erro', err.message);
    res.redirect('/ordens');
  }
}

async function criar(req, res) {
  try {
    await ordemServicoService.abrirOrdem(req.body, req.session.usuario.id);
    req.flash('sucesso', 'Ordem de serviço aberta com sucesso!');
    res.redirect('/ordens');
  } catch (err) {
    req.flash('erro', err.message);
    const clientes = await clienteService.listarClientes();
    res.render('ordens/form', { titulo: 'Abrir Ordem de Serviço', clientes, equipamentos: [] });
  }
}

async function atualizarStatus(req, res) {
  try {
    await ordemServicoService.atualizarStatus(req.params.id, req.body.status);
    req.flash('sucesso', 'Status atualizado com sucesso!');
    res.redirect(`/ordens/${req.params.id}`);
  } catch (err) {
    req.flash('erro', err.message);
    res.redirect(`/ordens/${req.params.id}`);
  }
}

async function registrarOrcamento(req, res) {
  try {
    await ordemServicoService.registrarOrcamento(req.params.id, req.body);
    req.flash('sucesso', 'Orçamento registrado com sucesso!');
    res.redirect(`/ordens/${req.params.id}`);
  } catch (err) {
    req.flash('erro', err.message);
    res.redirect(`/ordens/${req.params.id}`);
  }
}

// Consulta pública para clientes (sem login)
async function consultaPublica(req, res) {
  res.render('ordens/consulta-publica', { titulo: 'Consultar OS', ordem: null, erro: null });
}

async function buscarConsultaPublica(req, res) {
  try {
    const ordem = await ordemServicoService.buscarOrdemPorNumero(req.body.numero);
    res.render('ordens/consulta-publica', { titulo: 'Consultar OS', ordem, erro: null });
  } catch (err) {
    res.render('ordens/consulta-publica', { titulo: 'Consultar OS', ordem: null, erro: 'Ordem de serviço não encontrada.' });
  }
}

async function aprovarOrcamento(req, res) {
  try {
    await ordemServicoService.aprovarOrcamento(req.params.id);
    req.flash('sucesso', 'Orçamento aprovado com sucesso!');
    res.redirect(`/ordens/${req.params.id}`);
  } catch (err) {
    req.flash('erro', err.message);
    res.redirect(`/ordens/${req.params.id}`);
  }
}

async function rejeitarOrcamento(req, res) {
  try {
    await ordemServicoService.rejeitarOrcamento(req.params.id);
    req.flash('sucesso', 'Orçamento rejeitado.');
    res.redirect(`/ordens/${req.params.id}`);
  } catch (err) {
    req.flash('erro', err.message);
    res.redirect(`/ordens/${req.params.id}`);
  }
}

module.exports = {
  listar,
  exibirDetalhe,
  exibirForm,
  criar,
  atualizarStatus,
  registrarOrcamento,
  aprovarOrcamento,
  rejeitarOrcamento,
  consultaPublica,
  buscarConsultaPublica
};