const router   = require('express').Router();
const authWeb  = require('../controllers/authWebController');
const clienteWeb = require('../controllers/clienteWebController');
const usuarioWeb = require('../controllers/usuarioWebController');
const { sessaoMiddleware } = require('../middlewares/sessaoMiddleware');

// Rota raiz — redireciona para login
router.get('/', (req, res) => res.redirect('/login'));

// Auth
router.get('/login',  authWeb.exibirLogin);
router.post('/login', authWeb.realizarLogin);
router.get('/logout', authWeb.logout);

// Dashboard (protegido)
router.get('/dashboard', sessaoMiddleware, authWeb.dashboard);

// Clientes (protegido)
router.get('/clientes',              sessaoMiddleware, clienteWeb.listar);
router.get('/clientes/novo',         sessaoMiddleware, clienteWeb.exibirForm);
router.post('/clientes',             sessaoMiddleware, clienteWeb.criar);
router.get('/clientes/:id/editar',   sessaoMiddleware, clienteWeb.exibirEditar);
router.post('/clientes/:id',         sessaoMiddleware, clienteWeb.atualizar);
router.post('/clientes/:id/excluir', sessaoMiddleware, clienteWeb.excluir);

// Usuários (protegido)
router.get('/usuarios',            sessaoMiddleware, usuarioWeb.listar);
router.get('/usuarios/novo',       sessaoMiddleware, usuarioWeb.exibirForm);
router.post('/usuarios',           sessaoMiddleware, usuarioWeb.criar);
router.get('/usuarios/:id/editar', sessaoMiddleware, usuarioWeb.exibirEditar);
router.post('/usuarios/:id',       sessaoMiddleware, usuarioWeb.atualizar);

module.exports = router;