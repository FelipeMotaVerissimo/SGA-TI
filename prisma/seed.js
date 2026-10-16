const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

/**
 * Seed do SGA TI.
 *
 *   npm run seed        → os 7 perfis e o usuário `admin`
 *   npm run seed:demo   → o mesmo, mais um usuário por perfil
 *
 * Os usuários de demonstração ficam atrás de um comando próprio de propósito.
 * Criar sete contas com senha conhecida é aceitável numa máquina de
 * demonstração e inaceitável em produção — e um seed que faz isso por padrão
 * acaba rodando em produção mais cedo ou mais tarde.
 */

// Módulo 6: ENTREGADOR leva as OS finalizadas e só acessa as telas de entrega.
const PERFIS = ['ADMINISTRADOR', 'ATENDENTE', 'TECNICO', 'VENDEDOR', 'FINANCEIRO', 'COMPRAS', 'ENTREGADOR'];

const SENHA_PADRAO = 'admin123';

/** Os seis perfis não administrativos, para exercitar o RF022/RF023. */
const USUARIOS_DEMO = [
  { login: 'atendente',  nome: 'Atendente de Demonstração',  perfil: 'ATENDENTE' },
  { login: 'tecnico',    nome: 'Técnico de Demonstração',    perfil: 'TECNICO' },
  { login: 'vendedor',   nome: 'Vendedor de Demonstração',   perfil: 'VENDEDOR' },
  { login: 'financeiro', nome: 'Financeiro de Demonstração', perfil: 'FINANCEIRO' },
  { login: 'compras',    nome: 'Compras de Demonstração',    perfil: 'COMPRAS' },
  { login: 'entregador', nome: 'Entregador de Demonstração', perfil: 'ENTREGADOR' },
];

/** Cria o usuário se ainda não existir. Devolve se criou, para o relatório. */
async function garantirUsuario({ login, nome, perfilId, senhaHash }) {
  const existente = await prisma.usuario.findUnique({ where: { login } });
  if (existente) return false;

  await prisma.usuario.create({ data: { nome, login, senha: senhaHash, perfilId } });
  return true;
}

async function main() {
  const comDemo = process.argv.includes('--com-usuarios-demo');

  // `nomePerfil` é único, então o upsert resolve a repetição no próprio banco,
  // sem depender de uma consulta anterior que pode correr em paralelo.
  const perfis = {};
  for (const nomePerfil of PERFIS) {
    perfis[nomePerfil] = await prisma.perfil.upsert({
      where:  { nomePerfil },
      update: {},
      create: { nomePerfil },
    });
  }
  console.log(`Perfis: ${PERFIS.length} garantidos.`);

  const senhaHash = await bcrypt.hash(SENHA_PADRAO, 10);

  const criouAdmin = await garantirUsuario({
    login: 'admin', nome: 'Administrador',
    perfilId: perfis.ADMINISTRADOR.id, senhaHash,
  });
  console.log(`Usuário admin: ${criouAdmin ? 'criado' : 'já existia'}.`);

  if (comDemo) {
    let criados = 0;
    for (const u of USUARIOS_DEMO) {
      if (await garantirUsuario({
        login: u.login, nome: u.nome, perfilId: perfis[u.perfil].id, senhaHash,
      })) criados += 1;
    }
    console.log(`Usuários de demonstração: ${criados} criados, ` +
                `${USUARIOS_DEMO.length - criados} já existiam.`);
    console.log(`Logins: ${USUARIOS_DEMO.map((u) => u.login).join(', ')}.`);
  }

  console.log('\nSeed executado com sucesso!');
  console.log(`Senha de todos os usuários criados: ${SENHA_PADRAO}`);
  console.log('TROQUE AS SENHAS antes de colocar o sistema em uso real.');

  if (!comDemo) {
    console.log('\nPara criar também um usuário por perfil: npm run seed:demo');
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
