const router         = require('express').Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middlewares/authMiddleware');
const { exigirPerfilApi } = require('../middlewares/perfilMiddleware');

// Única rota pública da API: é por onde se obtém o token.
router.post('/login', authController.login);

/**
 * Criação de usuário — RF022/RF023.
 *
 * Esta rota não exigia nada e aceitava `perfilId` no corpo: qualquer pessoa
 * com acesso à porta criava um ADMINISTRADOR e obtinha um token JWT válido na
 * requisição seguinte, contornando por completo o controle de acesso. Agora
 * exige token e perfil de administrador, a mesma regra de `/usuarios` nas
 * telas web (`exigirPerfil()` em webRoutes).
 *
 * `exigirPerfilApi()` sem argumentos = só ADMINISTRADOR, que é o perfil que
 * passa em tudo.
 *
 * O primeiro administrador não nasce por aqui: vem do `prisma/seed.js`.
 */
router.post('/usuarios', authMiddleware, exigirPerfilApi(), authController.criar);

module.exports = router;
