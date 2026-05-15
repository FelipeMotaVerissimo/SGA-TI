const prisma = require('../config/database');
const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');

async function login(email, senha) {
  if (!email || !senha) throw Object.assign(new Error('Email e senha obrigatórios.'), { status: 400 });
  const usuario = await prisma.usuario.findUnique({ where: { email } });
  if (!usuario || !usuario.ativo) throw Object.assign(new Error('Credenciais inválidas.'), { status: 401 });
  const senhaValida = await bcrypt.compare(senha, usuario.senha);
  if (!senhaValida) throw Object.assign(new Error('Credenciais inválidas.'), { status: 401 });
  const token = jwt.sign({ id: usuario.id, perfil: usuario.perfil }, process.env.JWT_SECRET, { expiresIn: '8h' });
  return { token, usuario: { id: usuario.id, nome: usuario.nome, perfil: usuario.perfil } };
}

async function criarUsuario(dados) {
  const senhaHash = await bcrypt.hash(dados.senha, 10);
  return prisma.usuario.create({
    data: { ...dados, senha: senhaHash },
    select: { id: true, nome: true, email: true, perfil: true },
  });
}

module.exports = { login, criarUsuario };