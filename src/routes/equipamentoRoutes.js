const router             = require('express').Router();
const authMiddleware     = require('../middlewares/authMiddleware');
const { sessaoMiddleware } = require('../middlewares/sessaoMiddleware');
const equipamentoService = require('../services/equipamentoService');

// Rota para buscar equipamentos por cliente (usada pelo formulário de OS via fetch)
router.get('/cliente/:clienteId', sessaoMiddleware, async (req, res, next) => {
  try {
    const equipamentos = await equipamentoService.buscarPorCliente(req.params.clienteId);
    res.json(equipamentos);
  } catch (err) { next(err); }
});

// Rotas protegidas por JWT (API)
router.use(authMiddleware);

module.exports = router;