const router            = require('express').Router();
const produtoController = require('../controllers/produtoController');
const authMiddleware    = require('../middlewares/authMiddleware');
const { exigirPerfilApi } = require('../middlewares/perfilMiddleware');

// Módulo 4 — RF014 / RF015. Mesmos perfis das rotas web:
// consulta liberada para COMPRAS e VENDEDOR, escrita só para COMPRAS.
const CONSULTA = exigirPerfilApi('COMPRAS', 'VENDEDOR');
const ESCRITA  = exigirPerfilApi('COMPRAS');

router.use(authMiddleware);

router.get('/',                  CONSULTA, produtoController.listar);
router.get('/:id',               CONSULTA, produtoController.buscar);
router.get('/:id/movimentos',    CONSULTA, produtoController.listarMovimentos);

router.post('/',                 ESCRITA,  produtoController.criar);
router.put('/:id',               ESCRITA,  produtoController.atualizar);
router.delete('/:id',            ESCRITA,  produtoController.excluir);
router.post('/:id/reativar',     ESCRITA,  produtoController.reativar);
router.post('/:id/movimentos',   ESCRITA,  produtoController.movimentar);

module.exports = router;
