const jwt = require('jsonwebtoken');
const contexto = require('../config/contextoRequisicao');

function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ erro: 'Token não fornecido.' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = decoded;
    // NF005: nas rotas de API a identidade vem do token, não da sessão. Sem
    // isto o log de auditoria registraria as operações da API sem autor.
    contexto.definirUsuario(decoded.id);
    next();
  } catch (err) {
    return res.status(401).json({ erro: 'Token inválido ou expirado.' });
  }
}

module.exports = authMiddleware;