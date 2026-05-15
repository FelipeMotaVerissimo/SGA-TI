const router            = require('express').Router();
const clienteController = require('../controllers/clienteController');
const authMiddleware    = require('../middlewares/authMiddleware');

router.use(authMiddleware);
router.get('/',      clienteController.listar);
router.get('/:id',   clienteController.buscar);
router.post('/',     clienteController.criar);
router.put('/:id',   clienteController.atualizar);
router.delete('/:id',clienteController.excluir);

module.exports = router;