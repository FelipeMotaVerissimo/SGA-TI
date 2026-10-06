const ordemServicoService     = require('../services/ordemServicoService');
const equipamentoService      = require('../services/equipamentoService');
const clienteService          = require('../services/clienteService');
const servicoExecutadoService = require('../services/servicoExecutadoService'); // Módulo 3 - parte 2
const itemOrdemService        = require('../services/itemOrdemService');        // Módulo 4
const produtoService          = require('../services/produtoService');          // Módulo 4
const tipoServicoService      = require('../services/tipoServicoService');      // Módulo 5

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

/** Formata uma data para o value de <input type="date">, sem converter para UTC. */
function formatarDataInput(data) {
  const d = new Date(data);
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

async function exibirDetalhe(req, res) {
  try {
    const ordem = await ordemServicoService.buscarOrdemPorId(req.params.id);

    // Módulo 3 - parte 2: anexa a situação da garantia a cada serviço
    const servicos = servicoExecutadoService.enriquecerComGarantia(ordem.servicos);
    const podeRegistrarServico = servicoExecutadoService.podeRegistrarServico(ordem.status);
    const podeExcluirServico   = !servicoExecutadoService.STATUS_BLOQUEIA_EXCLUSAO.includes(ordem.status);
    const podeEditarOrcamento  = ordemServicoService.STATUS_PERMITE_ORCAMENTO.includes(ordem.status);

    // Módulo 4: produtos disponíveis para lançamento e total em peças
    // Módulo 5: catálogo de tipos, para classificar o serviço executado
    const [produtos, tiposServico] = await Promise.all([
      produtoService.listarDisponiveis(),
      tipoServicoService.listarDisponiveis(),
    ]);
    const totalItens     = itemOrdemService.calcularTotalItens(ordem.itens);
    const podeLancarItem = itemOrdemService.podeLancarItem(ordem.status);
    const podeRemoverItem = itemOrdemService.podeRemoverItem(ordem.status);

    res.render('ordens/detalhe', {
      titulo: `OS ${ordem.numero}`,
      ordem,
      servicos,
      podeRegistrarServico,
      podeExcluirServico,
      podeEditarOrcamento,
      produtos,
      tiposServico,
      totalItens,
      podeLancarItem,
      podeRemoverItem,
      formatarDataInput,
    });
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

/** Módulo 4: encerra a OS liberando o faturamento (perfil de gerência). */
async function faturar(req, res) {
  try {
    await ordemServicoService.faturarEEncerrar(req.params.id);
    req.flash('sucesso', 'OS faturada e encerrada. Conta a receber gerada no financeiro.');
  } catch (err) {
    req.flash('erro', err.message);
  }
  res.redirect(`/ordens/${req.params.id}`);
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
  res.render('ordens/consulta-publica', { titulo: 'Consultar OS', ordem: null, servicos: [], erro: null });
}

async function buscarConsultaPublica(req, res) {
  try {
    const ordem = await ordemServicoService.buscarOrdemPorNumero(req.body.numero);

    // Módulo 3 - parte 2: o cliente também vê os serviços e a garantia
    const servicos = servicoExecutadoService.enriquecerComGarantia(ordem.servicos || []);

    res.render('ordens/consulta-publica', { titulo: 'Consultar OS', ordem, servicos, erro: null });
  } catch (err) {
    res.render('ordens/consulta-publica', {
      titulo: 'Consultar OS',
      ordem: null,
      servicos: [],
      erro: 'Ordem de serviço não encontrada.',
    });
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
  faturar,
  registrarOrcamento,
  aprovarOrcamento,
  rejeitarOrcamento,
  consultaPublica,
  buscarConsultaPublica
};
