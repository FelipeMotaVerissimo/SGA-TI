const router               = require('express').Router();
const financeiroController = require('../controllers/financeiroController');
const authMiddleware       = require('../middlewares/authMiddleware');
const { exigirPerfilApi }  = require('../middlewares/perfilMiddleware');

// Módulo 4 — RF020 / RF021. Financeiro e administrador, como nas rotas web.
const FINANCEIRO = exigirPerfilApi('FINANCEIRO');

router.use(authMiddleware);
router.use(FINANCEIRO);

// :tipo = pagar | receber
router.get('/resumo',              financeiroController.resumo);
router.get('/:tipo',               financeiroController.listar);
router.get('/:tipo/:id',           financeiroController.buscar);
router.post('/:tipo',              financeiroController.criar);
router.put('/:tipo/:id',           financeiroController.atualizar);
router.post('/:tipo/:id/quitar',   financeiroController.quitar);
router.post('/:tipo/:id/cancelar', financeiroController.cancelar);

module.exports = router;
