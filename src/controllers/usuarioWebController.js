const authService = require('../services/authService');
const prisma      = require('../config/database');

async function listar(req, res) {
  try {
    const usuarios = await prisma.usuario.findMany({
      where:   { ativo: true },
      include: { perfil: true },
      orderBy: { nome: 'asc' },
    });
    res.render('usuarios/listar', { titulo: 'Usuários', usuarios });
  } catch (err) {
    req.flash('erro', err.message);
    res.redirect('/dashboard');
  }
}

async function exibirForm(req, res) {
  try {
    const perfis = await prisma.perfil.findMany({ orderBy: { nomePerfil: 'asc' } });
    res.render('usuarios/form', { titulo: 'Novo Usuário', usuario: null, perfis });
  } catch (err) {
    req.flash('erro', err.message);
    res.redirect('/usuarios');
  }
}

async function criar(req, res) {
  try {
    await authService.criarUsuario(req.body);
    req.flash('sucesso', 'Usuário criado com sucesso!');
    res.redirect('/usuarios');
  } catch (err) {
    req.flash('erro', err.message);
    const perfis = await prisma.perfil.findMany();
    res.render('usuarios/form', { titulo: 'Novo Usuário', usuario: req.body, perfis });
  }
}

async function exibirEditar(req, res) {
  try {
    const usuario = await prisma.usuario.findUnique({
      where:   { id: Number(req.params.id) },
      include: { perfil: true },
    });
    const perfis = await prisma.perfil.findMany({ orderBy: { nomePerfil: 'asc' } });
    res.render('usuarios/form', { titulo: 'Editar Usuário', usuario, perfis });
  } catch (err) {
    req.flash('erro', err.message);
    res.redirect('/usuarios');
  }
}

async function atualizar(req, res) {
  try {
    await prisma.usuario.update({
      where: { id: Number(req.params.id) },
      data:  {
        nome:     req.body.nome,
        login:    req.body.login,
        perfilId: Number(req.body.perfilId),
      },
    });
    req.flash('sucesso', 'Usuário atualizado com sucesso!');
    res.redirect('/usuarios');
  } catch (err) {
    req.flash('erro', err.message);
    res.redirect(`/usuarios/${req.params.id}/editar`);
  }
}

module.exports = { listar, exibirForm, criar, exibirEditar, atualizar };