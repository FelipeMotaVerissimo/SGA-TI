function sessaoMiddleware(req, res, next) {
  if (!req.session.usuario) {
    req.flash('erro', 'Faça login para acessar o sistema.');
    return res.redirect('/login');
  }
  next();
}

module.exports = { sessaoMiddleware };