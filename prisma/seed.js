const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

async function main() {
  const senhaHash = await bcrypt.hash('admin123', 10);

  await prisma.usuario.upsert({
    where:  { email: 'admin@sgati.com' },
    update: {},
    create: {
      nome:   'Administrador',
      email:  'admin@sgati.com',
      senha:  senhaHash,
      perfil: 'ADMINISTRADOR',
    },
  });

  console.log('Seed executado com sucesso!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());