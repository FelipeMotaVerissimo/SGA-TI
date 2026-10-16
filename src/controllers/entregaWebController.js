const entregaService = require('../services/entregaService');

/**
 * Módulo 6 — telas e ações da saída de entrega.
 * Mesmo padrão dos demais controllers web: try/catch + flash + redirect. A
 * exceção é a posição, enviada pelo celular via fetch, que responde JSON.
 */

const TELA = '/entregas/saida';

async function exibirSaida(req, res) {
  try {
    const ativa = await entregaService.saidaAtiva();
    const elegiveis = ativa ? [] : await entregaService.listarElegiveis();
    res.render('entregas/saida', {
      titulo: 'Saída de entrega',
      ativa,
      elegiveis,
      diasElegivel: entregaService.DIAS_ELEGIVEL,
    });
  } catch (err) {
    req.flash('erro', err.message);
    res.redirect('/dashboard');
  }
}

async function iniciar(req, res) {
  try {
    const saida = await entregaService.iniciarSaida(req.body.ordemIds, req.session.usuario);
    req.flash('sucesso', `Saída iniciada com ${saida.entregas.length} OS.`);
  } catch (err) {
    req.flash('erro', err.message);
  }
  res.redirect(TELA);
}

/** Posição do entregador (JSON). 201 gravada, 202 descartada pelo intervalo. */
async function registrarPosicao(req, res) {
  try {
    const r = await entregaService.registrarPosicao(req.body, req.session.usuario);
    if (r.descartada) return res.status(202).json({ descartada: true });
    return res.status(201).json({ descartada: false, registradaEm: r.posicao.registradaEm });
  } catch (err) {
    return res.status(err.status || 500).json({ erro: err.message });
  }
}

function marcar(resultado) {
  return async function (req, res) {
    try {
      await entregaService.marcarEntrega(req.params.id, resultado, req.body.motivo, req.session.usuario);
      req.flash('sucesso', resultado === 'ENTREGUE' ? 'Entrega confirmada.' : 'Registrado como não entregue.');
    } catch (err) {
      req.flash('erro', err.message);
    }
    res.redirect(TELA);
  };
}

async function encerrar(req, res) {
  try {
    await entregaService.encerrarSaida(req.session.usuario);
    req.flash('sucesso', 'Saída encerrada.');
  } catch (err) {
    req.flash('erro', err.message);
  }
  res.redirect(TELA);
}

async function cancelar(req, res) {
  try {
    await entregaService.cancelarSaida(req.params.id, req.session.usuario);
    req.flash('sucesso', 'Saída cancelada. As entregas pendentes ficaram como não entregues.');
  } catch (err) {
    req.flash('erro', err.message);
  }
  res.redirect(TELA);
}

module.exports = {
  exibirSaida,
  iniciar,
  registrarPosicao,
  marcarEntregue:    marcar('ENTREGUE'),
  marcarNaoEntregue: marcar('NAO_ENTREGUE'),
  encerrar,
  cancelar,
};
