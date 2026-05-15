const router         = require('express').Router();
const authController = require('../controllers/authController');

router.post('/login',    authController.login);
router.post('/usuarios', authController.criar);

module.exports = router;