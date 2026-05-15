function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  res.status(status).json({ erro: err.message || 'Erro interno do servidor.' });
}

module.exports = errorHandler;