const authService = require('../services/authService');

function exibirLogin(req, res) {
  if (req.session.usuario) return res.redirect('/dashboard');
  res.render('auth/login');
}

async function realizarLogin(req, res) {
  try {
    const { login, senha } = req.body;
    const resultado = await authService.login(login, senha);
    req.session.usuario = resultado.usuario;
    res.redirect('/dashboard');
  } catch (err) {
    req.flash('erro', err.message);
    res.redirect('/login');
  }
}

function logout(req, res) {
  req.session.destroy();
  res.redirect('/login');
}

async function dashboard(req, res) {
  res.render('dashboard', { titulo: 'Dashboard' });
}

module.exports = { exibirLogin, realizarLogin, logout, dashboard };