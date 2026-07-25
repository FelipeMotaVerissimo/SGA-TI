const router           = require('express').Router();
const authWeb          = require('../controllers/authWebController');
const clienteWeb       = require('../controllers/clienteWebController');
const usuarioWeb       = require('../controllers/usuarioWebController');
const equipamentoWeb   = require('../controllers/equipamentoWebController');
const ordemServicoWeb  = require('../controllers/ordemServicoWebController');
const { sessaoMiddleware } = require('../middlewares/sessaoMiddleware');

// Rota raiz
router.get('/', (req, res) => res.redirect('/login'));

// Auth
router.get('/login',  authWeb.exibirLogin);
router.post('/login', authWeb.realizarLogin);
router.get('/logout', authWeb.logout);

// Dashboard
router.get('/dashboard', sessaoMiddleware, authWeb.dashboard);

// Clientes
router.get('/clientes',              sessaoMiddleware, clienteWeb.listar);
router.get('/clientes/novo',         sessaoMiddleware, clienteWeb.exibirForm);
router.post('/clientes/novo',        sessaoMiddleware, clienteWeb.criar);
router.get('/clientes/:id/editar',   sessaoMiddleware, clienteWeb.exibirEditar);
router.post('/clientes/:id/editar',  sessaoMiddleware, clienteWeb.atualizar);
router.post('/clientes/:id/excluir', sessaoMiddleware, clienteWeb.excluir);

// Equipamentos
router.get('/equipamentos',              sessaoMiddleware, equipamentoWeb.listar);
router.get('/equipamentos/novo',         sessaoMiddleware, equipamentoWeb.exibirForm);
router.post('/equipamentos',             sessaoMiddleware, equipamentoWeb.criar);
router.get('/equipamentos/:id/editar',   sessaoMiddleware, equipamentoWeb.exibirEditar);
router.post('/equipamentos/:id',         sessaoMiddleware, equipamentoWeb.atualizar);

// Ordens de Serviço
router.get('/ordens',                    sessaoMiddleware, ordemServicoWeb.listar);
router.get('/ordens/nova',               sessaoMiddleware, ordemServicoWeb.exibirForm);
router.post('/ordens',                   sessaoMiddleware, ordemServicoWeb.criar);
router.get('/ordens/:id',                sessaoMiddleware, ordemServicoWeb.exibirDetalhe);
router.post('/ordens/:id/status',        sessaoMiddleware, ordemServicoWeb.atualizarStatus);
router.post('/ordens/:id/orcamento',     sessaoMiddleware, ordemServicoWeb.registrarOrcamento);

// Consulta pública (sem login)
router.get('/consulta',  ordemServicoWeb.consultaPublica);
router.post('/consulta', ordemServicoWeb.buscarConsultaPublica);

// Usuários
router.get('/usuarios',            sessaoMiddleware, usuarioWeb.listar);
router.get('/usuarios/novo',       sessaoMiddleware, usuarioWeb.exibirForm);
router.post('/usuarios',           sessaoMiddleware, usuarioWeb.criar);
router.get('/usuarios/:id/editar', sessaoMiddleware, usuarioWeb.exibirEditar);
router.post('/usuarios/:id',       sessaoMiddleware, usuarioWeb.atualizar);

module.exports = router;