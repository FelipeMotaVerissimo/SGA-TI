const router           = require('express').Router();
const authWeb          = require('../controllers/authWebController');
const clienteWeb       = require('../controllers/clienteWebController');
const usuarioWeb       = require('../controllers/usuarioWebController');
const equipamentoWeb   = require('../controllers/equipamentoWebController');
const ordemServicoWeb  = require('../controllers/ordemServicoWebController');
const servicoWeb       = require('../controllers/servicoExecutadoWebController'); // Módulo 3 - parte 2
const produtoWeb       = require('../controllers/produtoWebController');          // Módulo 4
const itemOrdemWeb     = require('../controllers/itemOrdemWebController');        // Módulo 4
const financeiroWeb    = require('../controllers/financeiroWebController');       // Módulo 4
const relatorioWeb     = require('../controllers/relatorioWebController');        // Módulo 5
const tipoServicoWeb   = require('../controllers/tipoServicoWebController');      // Módulo 5
const { sessaoMiddleware } = require('../middlewares/sessaoMiddleware');
const { exigirPerfil }     = require('../middlewares/perfilMiddleware');          // Módulo 4

/**
 * Módulo 4 — perfis por rota (RF023).
 * ADMINISTRADOR passa em tudo, por isso não aparece nas listas abaixo.
 * A divisão segue a entrevista com o consultor (item 8) e os casos de uso 2.3.1.
 */
const PERFIS_CADASTRO   = ['ATENDENTE'];                        // clientes e equipamentos
const PERFIS_OS         = ['ATENDENTE', 'TECNICO'];             // abrir e consultar OS
const PERFIS_TECNICO    = ['TECNICO'];                          // status e serviços executados
const PERFIS_ORCAMENTO  = ['VENDEDOR'];                         // lançar orçamento
const PERFIS_APROVACAO  = ['ATENDENTE', 'VENDEDOR'];            // registrar a resposta do cliente
const PERFIS_PRODUTO    = ['COMPRAS'];                          // cadastro e estoque (RF015)
const PERFIS_ITEM_OS    = ['VENDEDOR'];                         // lançar peça na OS
const PERFIS_FINANCEIRO = ['FINANCEIRO'];                       // contas a pagar/receber

// Rota raiz
router.get('/', (req, res) => res.redirect('/login'));

// Auth
router.get('/login',  authWeb.exibirLogin);
router.post('/login', authWeb.realizarLogin);
router.get('/logout', authWeb.logout);

// Dashboard — todo usuário autenticado
router.get('/dashboard', sessaoMiddleware, authWeb.dashboard);

// Clientes
router.get('/clientes',              sessaoMiddleware, exigirPerfil(...PERFIS_CADASTRO), clienteWeb.listar);
router.get('/clientes/novo',         sessaoMiddleware, exigirPerfil(...PERFIS_CADASTRO), clienteWeb.exibirForm);
router.post('/clientes/novo',        sessaoMiddleware, exigirPerfil(...PERFIS_CADASTRO), clienteWeb.criar);
router.get('/clientes/:id/editar',   sessaoMiddleware, exigirPerfil(...PERFIS_CADASTRO), clienteWeb.exibirEditar);
router.post('/clientes/:id/editar',  sessaoMiddleware, exigirPerfil(...PERFIS_CADASTRO), clienteWeb.atualizar);
router.post('/clientes/:id/excluir', sessaoMiddleware, exigirPerfil(),                   clienteWeb.excluir); // UC RF004: só administrador

// Equipamentos
router.get('/equipamentos',              sessaoMiddleware, exigirPerfil(...PERFIS_CADASTRO), equipamentoWeb.listar);
router.get('/equipamentos/novo',         sessaoMiddleware, exigirPerfil(...PERFIS_CADASTRO), equipamentoWeb.exibirForm);
router.post('/equipamentos',             sessaoMiddleware, exigirPerfil(...PERFIS_CADASTRO), equipamentoWeb.criar);
router.get('/equipamentos/:id/editar',   sessaoMiddleware, exigirPerfil(...PERFIS_CADASTRO), equipamentoWeb.exibirEditar);
router.post('/equipamentos/:id',         sessaoMiddleware, exigirPerfil(...PERFIS_CADASTRO), equipamentoWeb.atualizar);
// RF012 — histórico de serviços por equipamento. O TECNICO entra aqui vindo da
// OS: é ele quem precisa saber o que já foi feito na máquina antes de mexer.
router.get('/equipamentos/:id/historico', sessaoMiddleware, exigirPerfil(...PERFIS_CADASTRO, 'TECNICO'), equipamentoWeb.exibirHistorico);

// Ordens de Serviço
router.get('/ordens',                sessaoMiddleware, exigirPerfil(...PERFIS_OS, 'VENDEDOR'), ordemServicoWeb.listar);
router.get('/ordens/nova',           sessaoMiddleware, exigirPerfil(...PERFIS_OS),             ordemServicoWeb.exibirForm);
router.post('/ordens',               sessaoMiddleware, exigirPerfil(...PERFIS_OS),             ordemServicoWeb.criar);
router.get('/ordens/:id',            sessaoMiddleware, exigirPerfil(...PERFIS_OS, 'VENDEDOR'), ordemServicoWeb.exibirDetalhe);
// O encerramento é o ato que gera a conta a receber — na entrevista (item 8) a
// liberação de faturamento é da Gerência/ADM, então o técnico não fecha a OS.
router.post('/ordens/:id/status',    sessaoMiddleware, exigirPerfil(...PERFIS_TECNICO),        ordemServicoWeb.atualizarStatus);
router.post('/ordens/:id/faturar',   sessaoMiddleware, exigirPerfil(),                         ordemServicoWeb.faturar);
router.post('/ordens/:id/orcamento', sessaoMiddleware, exigirPerfil(...PERFIS_ORCAMENTO),      ordemServicoWeb.registrarOrcamento);
router.post('/ordens/:id/aprovar',   sessaoMiddleware, exigirPerfil(...PERFIS_APROVACAO),      ordemServicoWeb.aprovarOrcamento);
router.post('/ordens/:id/rejeitar',  sessaoMiddleware, exigirPerfil(...PERFIS_APROVACAO),      ordemServicoWeb.rejeitarOrcamento);

// Serviços Executados e Garantia (Módulo 3 - parte 2)
router.post('/ordens/:id/servicos',                    sessaoMiddleware, exigirPerfil(...PERFIS_TECNICO), servicoWeb.registrar);
router.post('/ordens/:id/servicos/:servicoId/excluir', sessaoMiddleware, exigirPerfil(...PERFIS_TECNICO), servicoWeb.excluir);

// Produtos e Estoque (Módulo 4 - parte 1)
router.get('/produtos',                 sessaoMiddleware, exigirPerfil(...PERFIS_PRODUTO, 'VENDEDOR'), produtoWeb.listar);
router.get('/produtos/novo',            sessaoMiddleware, exigirPerfil(...PERFIS_PRODUTO), produtoWeb.exibirForm);
router.post('/produtos',                sessaoMiddleware, exigirPerfil(...PERFIS_PRODUTO), produtoWeb.criar);
router.get('/produtos/:id/editar',      sessaoMiddleware, exigirPerfil(...PERFIS_PRODUTO), produtoWeb.exibirEditar);
router.post('/produtos/:id',            sessaoMiddleware, exigirPerfil(...PERFIS_PRODUTO), produtoWeb.atualizar);
router.post('/produtos/:id/excluir',    sessaoMiddleware, exigirPerfil(...PERFIS_PRODUTO), produtoWeb.excluir);
router.post('/produtos/:id/reativar',   sessaoMiddleware, exigirPerfil(...PERFIS_PRODUTO), produtoWeb.reativar);
router.get('/produtos/:id/estoque',     sessaoMiddleware, exigirPerfil(...PERFIS_PRODUTO, 'VENDEDOR'), produtoWeb.exibirEstoque);
router.post('/produtos/:id/estoque',    sessaoMiddleware, exigirPerfil(...PERFIS_PRODUTO), produtoWeb.movimentar);

// Produtos lançados na OS (Módulo 4 - parte 1)
router.post('/ordens/:id/itens',                    sessaoMiddleware, exigirPerfil(...PERFIS_ITEM_OS), itemOrdemWeb.lancar);
router.post('/ordens/:id/itens/:itemId/remover',    sessaoMiddleware, exigirPerfil(...PERFIS_ITEM_OS), itemOrdemWeb.remover);

// Financeiro (Módulo 4 - parte 2)
router.get('/financeiro',                       sessaoMiddleware, exigirPerfil(...PERFIS_FINANCEIRO), financeiroWeb.painel);
router.get('/financeiro/:tipo/nova',            sessaoMiddleware, exigirPerfil(...PERFIS_FINANCEIRO), financeiroWeb.exibirForm);
router.post('/financeiro/:tipo',                sessaoMiddleware, exigirPerfil(...PERFIS_FINANCEIRO), financeiroWeb.criar);
router.get('/financeiro/:tipo/:id/editar',      sessaoMiddleware, exigirPerfil(...PERFIS_FINANCEIRO), financeiroWeb.exibirEditar);
router.post('/financeiro/:tipo/:id/editar',     sessaoMiddleware, exigirPerfil(...PERFIS_FINANCEIRO), financeiroWeb.atualizar);
router.post('/financeiro/:tipo/:id/quitar',     sessaoMiddleware, exigirPerfil(...PERFIS_FINANCEIRO), financeiroWeb.quitar);
router.post('/financeiro/:tipo/:id/cancelar',   sessaoMiddleware, exigirPerfil(...PERFIS_FINANCEIRO), financeiroWeb.cancelar);

// Catálogo de tipos de serviço (Módulo 5) — configuração, perfil gerencial
router.get('/tipos-servico',                sessaoMiddleware, exigirPerfil(), tipoServicoWeb.listar);
router.get('/tipos-servico/novo',           sessaoMiddleware, exigirPerfil(), tipoServicoWeb.exibirForm);
router.post('/tipos-servico',               sessaoMiddleware, exigirPerfil(), tipoServicoWeb.criar);
router.get('/tipos-servico/:id/editar',     sessaoMiddleware, exigirPerfil(), tipoServicoWeb.exibirEditar);
router.post('/tipos-servico/:id',           sessaoMiddleware, exigirPerfil(), tipoServicoWeb.atualizar);
router.post('/tipos-servico/:id/desativar', sessaoMiddleware, exigirPerfil(), tipoServicoWeb.desativar);
router.post('/tipos-servico/:id/reativar',  sessaoMiddleware, exigirPerfil(), tipoServicoWeb.reativar);

// Relatórios (Módulo 5) — UC RF008: "usuário autenticado com permissão gerencial"
router.get('/relatorios', sessaoMiddleware, exigirPerfil(), relatorioWeb.exibir);
router.get('/relatorios/:relatorio/csv', sessaoMiddleware, exigirPerfil(), relatorioWeb.exportar);

// Consulta pública (sem login)
router.get('/consulta',  ordemServicoWeb.consultaPublica);
router.post('/consulta', ordemServicoWeb.buscarConsultaPublica);

// Usuários — exclusivo do administrador
router.get('/usuarios',            sessaoMiddleware, exigirPerfil(), usuarioWeb.listar);
router.get('/usuarios/novo',       sessaoMiddleware, exigirPerfil(), usuarioWeb.exibirForm);
router.post('/usuarios',           sessaoMiddleware, exigirPerfil(), usuarioWeb.criar);
router.get('/usuarios/:id/editar', sessaoMiddleware, exigirPerfil(), usuarioWeb.exibirEditar);
router.post('/usuarios/:id',       sessaoMiddleware, exigirPerfil(), usuarioWeb.atualizar);

module.exports = router;
