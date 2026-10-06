const auditoriaService = require('../services/auditoriaService');
const { formatarDataInput } = require('../services/relatorioService');

/**
 * NF005 — tela de auditoria.
 *
 * Só existe `exibir`. Não há criar, editar nem excluir, de propósito: a rota
 * que não existe é a que ninguém chama por engano.
 */
async function exibir(req, res) {
  try {
    const filtros = {
      de:        req.query.de,
      ate:       req.query.ate,
      usuarioId: req.query.usuarioId,
      entidade:  req.query.entidade,
      acao:      req.query.acao,
    };

    const [resultado, opcoes] = await Promise.all([
      auditoriaService.listar(filtros),
      auditoriaService.opcoesDeFiltro(),
    ]);

    res.render('auditoria/listar', {
      titulo: 'Auditoria',
      ...resultado,
      opcoes,
      filtros,
      diferencas: auditoriaService.diferencas,
      formulario: {
        de:  formatarDataInput(resultado.periodo.de),
        ate: formatarDataInput(resultado.periodo.ate),
      },
    });
  } catch (err) {
    // Período invertido volta à tela com aviso, em vez de quebrar — mesmo
    // tratamento dos relatórios (RN04 do Módulo 5).
    req.flash('erro', err.message);
    res.redirect('/dashboard');
  }
}

module.exports = { exibir };
