const fs = require('fs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'mysql://4T6scHMTiE3Yocz.root:ZDQJzwVsvEDZs19H@gateway01.sa-east-1.prod.aws.tidbcloud.com:4000/test?ssl={"rejectUnauthorized":true}'
    }
  }
});

async function run() {
  console.log('Lendo tabelas.sql...');
  const sql = fs.readFileSync('tabelas.sql', 'utf8');

  // Divide o arquivo por comandos individuais para o Prisma executar cada instrução
  const statements = sql
    .split(/;\s*$/m)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  console.log(`Conectando ao TiDB e executando ${statements.length} instrucoes...`);

  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }

  console.log('Tabelas criadas com sucesso!');
  await prisma.$disconnect();
}

run().catch(async (err) => {
  console.error('Erro ao executar:', err);
  await prisma.$disconnect();
  process.exit(1);
});