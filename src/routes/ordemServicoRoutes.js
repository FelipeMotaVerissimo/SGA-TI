const router                  = require('express').Router();
const ordemServicoController  = require('../controllers/ordemServicoController');
const authMiddleware          = require('../middlewares/authMiddleware');

router.use(authMiddleware);
router.get('/',                router.get('/',     ordemServicoController.listar));
router.get('/:id',             ordemServicoController.buscar);
router.post('/',               ordemServicoController.abrir);
router.put('/:id/status',      ordemServicoController.atualizarStatus);
router.put('/:id/orcamento',   ordemServicoController.registrarOrcamento);

module.exports = router;