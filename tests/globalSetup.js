/**
 * Cria o schema do banco de teste antes da suíte rodar.
 *
 * Usa `prisma db push`, que aplica o schema direto, sem depender da pasta
 * de migrations. Escolhe o schema conforme o que existe na máquina:
 *  - sandbox/prisma-dev/schema.dev.prisma (SQLite), quando existe um ambiente
 *    de desenvolvimento local montado — esse caminho não é versionado;
 *  - prisma/schema.prisma (MySQL) no resto dos casos, inclusive num clone
 *    limpo — aí é preciso um TEST_DATABASE_URL apontando para um MySQL vazio.
 */

const { execFileSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

require('./helpers/ambiente');

const RAIZ = path.join(__dirname, '..');

module.exports = async function () {
  const schemaDev = path.join(RAIZ, 'sandbox', 'prisma-dev', 'schema.dev.prisma');
  const schema    = fs.existsSync(schemaDev) ? schemaDev : path.join(RAIZ, 'prisma', 'schema.prisma');

  // Chama o CLI do Prisma pelo próprio Node em vez de `npx`: no Windows,
  // spawnar um .cmd sem shell devolve EINVAL desde as correções de segurança
  // do Node 18.20/20.12. Assim também não depende do npx estar no PATH.
  const cli = require.resolve('prisma/build/index.js');

  try {
    execFileSync(
      process.execPath,
      [cli, 'db', 'push', '--schema', schema, '--skip-generate', '--accept-data-loss'],
      { cwd: RAIZ, stdio: 'pipe' }
    );
  } catch (e) {
    const saida = [e.stdout, e.stderr].filter(Boolean).map((s) => s.toString()).join('\n');
    throw new Error(
      'Não foi possível preparar o banco de teste.\n' +
      `Schema: ${schema}\n${saida || e.message}`
    );
  }
};
