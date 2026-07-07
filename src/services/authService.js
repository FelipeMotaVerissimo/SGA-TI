const prisma = require('../config/database');
const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');

async function login(login, senha) {
  if (!login || !senha) throw Object.assign(new Error('Login e senha obrigatórios.'), { status: 400 });
  const usuario = await prisma.usuario.findUnique({
    where: { login },
    include: { perfil: true },
  });
  if (!usuario || !usuario.ativo) throw Object.assign(new Error('Credenciais inválidas.'), { status: 401 });
  const senhaValida = await bcrypt.compare(senha, usuario.senha);
  if (!senhaValida) throw Object.assign(new Error('Credenciais inválidas.'), { status: 401 });
  const token = jwt.sign({ id: usuario.id, perfil: usuario.perfil.nomePerfil }, process.env.JWT_SECRET, { expiresIn: '8h' });
  return {
    token,
    usuario: {
      id:     usuario.id,
      nome:   usuario.nome,
      login:  usuario.login,
      perfil: usuario.perfil.nomePerfil,
    },
  };
}

async function criarUsuario(dados) {
  const senhaHash = await bcrypt.hash(dados.senha, 10);
  return prisma.usuario.create({
    data: {
      nome:     dados.nome,
      login:    dados.login,
      senha:    senhaHash,
      perfilId: Number(dados.perfilId),
    },
    select: { id: true, nome: true, login: true, perfil: true },
  });
}

module.exports = { login, criarUsuario };