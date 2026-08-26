const authService      = require('../services/authService');
const prisma           = require('../config/database');
const financeiroService = require('../services/financeiroService');  // Módulo 5
const relatorioService  = require('../services/relatorioService');   // Módulo 5
const { temPermissao }  = require('../middlewares/perfilMiddleware');

function exibirLogin(req, res) {
  if (req.session.usuario) return res.redirect('/dashboard');
  res.render('auth/login');
}

async function realizarLogin(req, res) {
  try {
    const { login, senha } = req.body;
    const resultado = await authService.login(login, senha);
    req.session.usuario = resultado.usuario;
    res.redirect('/dashboard');
  } catch (err) {
    req.flash('erro', err.message);
    res.redirect('/login');
  }
}

function logout(req, res) {
  req.session.destroy();
  res.redirect('/login');
}

/**
 * Dashboard com números reais.
 *
 * Até aqui os quatro cartões eram zeros fixos no HTML e a tabela dizia
 * "Nenhuma ordem de serviço cadastrada" mesmo com o banco cheio.
 */
async function dashboard(req, res) {
  try {
    const inicioDoMes = new Date();
    inicioDoMes.setDate(1);
    inicioDoMes.setHours(0, 0, 0, 0);

    const [abertas, aguardandoOrcamento, emAndamento, finalizadasNoMes, recentes] =
      await Promise.all([
        // "Abertas" = tudo que ainda não terminou nem foi cancelado
        prisma.ordemServico.count({
          where: { status: { in: ['INICIAL', 'ORCAMENTO', 'AUTORIZADO', 'EM_ANDAMENTO'] } },
        }),
        prisma.ordemServico.count({ where: { status: 'ORCAMENTO' } }),
        prisma.ordemServico.count({ where: { status: 'EM_ANDAMENTO' } }),
        prisma.ordemServico.count({
          where: { status: 'FINALIZADO', dataFechamento: { gte: inicioDoMes } },
        }),
        prisma.ordemServico.findMany({
          take: 5,
          orderBy: { dataAbertura: 'desc' },
          include: { equipamento: { include: { cliente: true } } },
        }),
      ]);

    // Módulo 5 — dashboards de acompanhamento.
    // Cada bloco só é consultado para quem pode vê-lo: não faz sentido carregar
    // (nem exibir) o caixa da empresa para o técnico.
    const usuario = req.session.usuario;
    const veFinanceiro = temPermissao(usuario, ['FINANCEIRO']);
    const veEstoque    = temPermissao(usuario, ['COMPRAS', 'VENDEDOR']);
    const veGarantia   = temPermissao(usuario, ['TECNICO']);

    const [financeiro, estoque, garantia] = await Promise.all([
      veFinanceiro ? financeiroService.resumo()             : null,
      veEstoque    ? relatorioService.indicadoresEstoque()  : null,
      veGarantia   ? relatorioService.indicadoresGarantia() : null,
    ]);

    res.render('dashboard', {
      titulo: 'Dashboard',
      resumo: { abertas, aguardandoOrcamento, emAndamento, finalizadasNoMes },
      recentes,
      financeiro,
      estoque,
      garantia,
    });
  } catch (err) {
    // O dashboard é a tela pós-login: falhar aqui deixaria o usuário preso.
    req.flash('erro', `Não foi possível carregar os indicadores: ${err.message}`);
    res.render('dashboard', {
      titulo: 'Dashboard',
      resumo: { abertas: 0, aguardandoOrcamento: 0, emAndamento: 0, finalizadasNoMes: 0 },
      recentes: [],
      financeiro: null,
      estoque: null,
      garantia: null,
    });
  }
}

module.exports = { exibirLogin, realizarLogin, logout, dashboard };