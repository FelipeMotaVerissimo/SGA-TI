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

const { URL_TESTE } = require('./helpers/ambiente');

const RAIZ = path.join(__dirname, '..');

module.exports = async function () {
  // O schema é escolhido pela URL do banco, não pela existência do arquivo.
  // Enquanto olhava só o arquivo, apontar TEST_DATABASE_URL para MySQL ainda
  // carregava o schema SQLite e o Prisma recusava: "the URL must start with
  // the protocol file:".
  const ehSqlite  = URL_TESTE.startsWith('file:');
  const schemaDev = path.join(RAIZ, 'sandbox', 'prisma-dev', 'schema.dev.prisma');
  const schemaProd = path.join(RAIZ, 'prisma', 'schema.prisma');

  const schema = ehSqlite && fs.existsSync(schemaDev) ? schemaDev : schemaProd;

  if (ehSqlite && !fs.existsSync(schemaDev)) {
    throw new Error(
      'O banco de teste é SQLite, mas o schema de desenvolvimento não existe.\n' +
      'Aponte TEST_DATABASE_URL para um MySQL vazio, por exemplo:\n' +
      '  TEST_DATABASE_URL="mysql://usuario:senha@localhost:3306/sga_ti_teste"'
    );
  }

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
