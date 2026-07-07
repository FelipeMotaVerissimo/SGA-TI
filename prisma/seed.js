const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

async function main() {
  // Cria os perfis (conforme entrevista com o consultor)
  const nomesPerfis = [
    'ADMINISTRADOR',
    'ATENDENTE',
    'TECNICO',
    'VENDEDOR',
    'FINANCEIRO',
    'COMPRAS',
  ];

  for (const nome of nomesPerfis) {
    const existente = await prisma.perfil.findFirst({ where: { nomePerfil: nome } });
    if (!existente) {
      await prisma.perfil.create({ data: { nomePerfil: nome } });
    }
  }

  const perfilAdmin = await prisma.perfil.findFirst({ where: { nomePerfil: 'ADMINISTRADOR' } });

  const senhaHash = await bcrypt.hash('admin123', 10);

  const usuarioExistente = await prisma.usuario.findUnique({ where: { login: 'admin' } });
  if (!usuarioExistente) {
    await prisma.usuario.create({
      data: {
        nome:     'Administrador',
        login:    'admin',
        senha:    senhaHash,
        perfilId: perfilAdmin.id,
      },
    });
  }

  console.log('Seed executado com sucesso!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());