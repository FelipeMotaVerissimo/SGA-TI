const rastreioService = require('../services/rastreioService');
const { dadosDaConsulta, renderizarConsulta } = require('./ordemServicoWebController');

/**
 * Módulo 6 — o cliente acompanha a entrega pela consulta pública.
 * Sem login: a proteção é o número da OS + os 4 últimos dígitos do telefone,
 * com limite de tentativas por IP e por OS (src/config/seguranca.js).
 */

/** POST /consulta/rastreio — confere os dígitos e mostra o mapa. */
async function verificar(req, res) {
  const numero = String(req.body.numero || '').trim();
  try {
    const { token } = await rastreioService.verificar(numero, req.body.digitos);
    res.locals.digitosConferem = true;   // acerto não consome a cota (RN28)
    const dados = await dadosDaConsulta(numero);
    renderizarConsulta(res, { ...dados, numeroInformado: numero, tokenRastreio: token });
  } catch (err) {
    // Erro: volta à mesma OS, com o aviso no bloco da entrega.
    try {
      const dados = await dadosDaConsulta(numero);
      renderizarConsulta(res, { ...dados, numeroInformado: numero, erroRastreio: err.message });
    } catch {
      renderizarConsulta(res, { erro: 'Ordem de serviço não encontrada.' });
    }
  }
}

/**
 * GET /rastreio/:token/posicao — chamado pelo mapa a cada 10 s.
 * RN30: só a posição e o destino desta entrega; qualquer problema é 404
 * genérico, sem dizer se o token existiu ou se a entrega acabou.
 */
async function posicao(req, res) {
  res.set('Cache-Control', 'no-store');
  try {
    const dados = await rastreioService.posicaoPublica(req.params.token);
    if (!dados) return res.status(404).json({ erro: 'Não encontrado.' });
    return res.json(dados);
  } catch {
    return res.status(404).json({ erro: 'Não encontrado.' });
  }
}

module.exports = { verificar, posicao };
