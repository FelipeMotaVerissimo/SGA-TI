const relatorioService = require('../services/relatorioService');
const csvService       = require('../services/csvService');

/**
 * Módulo 5 — tela de relatórios gerenciais (UC RF008).
 *
 * Um único período vale para todos os relatórios da página: o gestor escolhe
 * o intervalo uma vez e compara os números entre si.
 */
async function exibir(req, res) {
  try {
    const periodo = relatorioService.resolverPeriodo(req.query);

    const [clientes, produtos, servicos, equipamentos] = await Promise.all([
      relatorioService.maioresClientes(req.query),
      relatorioService.produtosMaisVendidos(req.query),
      relatorioService.servicosMaisExecutados(req.query),
      relatorioService.porTipoDeEquipamento(req.query),
    ]);

    res.render('relatorios/index', {
      titulo: 'Relatórios',
      periodo,
      filtro: {
        de:  relatorioService.formatarDataInput(periodo.de),
        ate: relatorioService.formatarDataInput(periodo.ate),
      },
      clientes,
      produtos,
      servicos,
      equipamentos,
    });
  } catch (err) {
    // Período inválido não pode derrubar a tela: volta para o padrão e avisa.
    req.flash('erro', err.message);
    res.redirect('/relatorios');
  }
}

/**
 * Definição de cada relatório exportável: como buscar e quais colunas sair.
 * Mantido junto para o CSV nunca divergir do que a tela mostra.
 */
const EXPORTAVEIS = {
  clientes: {
    arquivo: 'maiores-clientes',
    buscar:  (q) => relatorioService.maioresClientes(q),
    colunas: [
      { titulo: 'Cliente',      campo: 'cliente' },
      { titulo: 'CPF/CNPJ',     campo: 'cpfCnpj' },
      { titulo: 'Ordens',       campo: 'ordens' },
      { titulo: 'Total Orçado', campo: 'total',       tipo: 'numero' },
      { titulo: 'Já Aprovado',  campo: 'aprovado',    tipo: 'numero' },
      { titulo: 'Ticket Médio', campo: 'ticketMedio', tipo: 'numero' },
    ],
  },
  produtos: {
    arquivo: 'produtos-mais-vendidos',
    buscar:  (q) => relatorioService.produtosMaisVendidos(q),
    colunas: [
      { titulo: 'Produto',       campo: 'produto' },
      { titulo: 'Quantidade',    campo: 'quantidade' },
      { titulo: 'Total Vendido', campo: 'total', tipo: 'numero' },
    ],
  },
  servicos: {
    arquivo: 'servicos-mais-executados',
    buscar:  (q) => relatorioService.servicosMaisExecutados(q),
    colunas: [
      { titulo: 'Tipo de Serviço', campo: 'tipo' },
      { titulo: 'Execuções',       campo: 'quantidade' },
      { titulo: 'Com Garantia',    campo: 'comGarantia' },
    ],
  },
  equipamentos: {
    arquivo: 'por-tipo-de-equipamento',
    buscar:  (q) => relatorioService.porTipoDeEquipamento(q),
    colunas: [
      { titulo: 'Tipo de Equipamento', campo: 'tipo' },
      { titulo: 'Serviços Executados', campo: 'servicos' },
      { titulo: 'Peças Usadas',        campo: 'pecas' },
      { titulo: 'Total em Peças',      campo: 'totalPecas', tipo: 'numero' },
    ],
  },
};

/** UC RF008 — "relatório exibido ou exportado". */
async function exportar(req, res) {
  try {
    const definicao = EXPORTAVEIS[req.params.relatorio];
    if (!definicao) {
      throw Object.assign(new Error('Relatório não encontrado.'), { status: 404 });
    }

    const periodo = relatorioService.resolverPeriodo(req.query);
    const linhas  = await definicao.buscar(req.query);
    const csv     = csvService.gerar(definicao.colunas, linhas);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${csvService.nomeArquivo(definicao.arquivo, periodo)}"`
    );
    res.send(csv);
  } catch (err) {
    req.flash('erro', err.message);
    res.redirect('/relatorios');
  }
}

module.exports = { exibir, exportar, EXPORTAVEIS };
