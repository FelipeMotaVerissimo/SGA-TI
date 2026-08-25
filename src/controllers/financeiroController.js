const financeiroService = require('../services/financeiroService');

/**
 * API REST do financeiro (Módulo 4).
 *
 * O `:tipo` da URL é `pagar` ou `receber` — as duas contas têm o mesmo ciclo
 * de vida, então compartilham as rotas.
 */

const MAPA = {
  pagar:   financeiroService.TIPO_PAGAR,
  receber: financeiroService.TIPO_RECEBER,
};

function tipoDaRota(valor) {
  const tipo = MAPA[String(valor || '').toLowerCase()];
  if (!tipo) {
    throw Object.assign(
      new Error("Tipo de conta inválido. Use 'pagar' ou 'receber'."),
      { status: 404 }
    );
  }
  return tipo;
}

async function resumo(req, res, next) {
  try { res.json(await financeiroService.resumo()); }
  catch (err) { next(err); }
}

async function listar(req, res, next) {
  try {
    res.json(await financeiroService.listarContas(
      tipoDaRota(req.params.tipo),
      { situacao: req.query.situacao }
    ));
  } catch (err) { next(err); }
}

async function buscar(req, res, next) {
  try {
    res.json(await financeiroService.buscarConta(tipoDaRota(req.params.tipo), req.params.id));
  } catch (err) { next(err); }
}

async function criar(req, res, next) {
  try {
    res.status(201).json(
      await financeiroService.criarConta(tipoDaRota(req.params.tipo), req.body)
    );
  } catch (err) { next(err); }
}

async function atualizar(req, res, next) {
  try {
    res.json(
      await financeiroService.editarConta(tipoDaRota(req.params.tipo), req.params.id, req.body)
    );
  } catch (err) { next(err); }
}

async function quitar(req, res, next) {
  try {
    res.json(await financeiroService.quitarConta(
      tipoDaRota(req.params.tipo), req.params.id, req.usuario && req.usuario.id
    ));
  } catch (err) { next(err); }
}

async function cancelar(req, res, next) {
  try {
    res.json(await financeiroService.cancelarConta(tipoDaRota(req.params.tipo), req.params.id));
  } catch (err) { next(err); }
}

module.exports = { resumo, listar, buscar, criar, atualizar, quitar, cancelar };
