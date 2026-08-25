/**
 * Ambiente dos testes de integração.
 *
 * Precisa ser o PRIMEIRO require de cada arquivo de teste, antes de
 * `src/app` — o Prisma Client lê a URL do banco no momento em que é
 * construído, e `src/config/database.js` constrói na hora do require.
 *
 * Os testes NUNCA rodam no banco de desenvolvimento: eles apagam e recriam
 * tabelas inteiras. Se a URL apontar para o dev, o processo aborta.
 */

const path = require('path');

// O Prisma não aceita barra invertida na URL do SQLite — no Windows,
// path.join devolve "C:\...\test.db", que precisa virar "C:/.../test.db".
const CAMINHO_SQLITE = path.join(__dirname, '..', '..', 'prisma', 'test.db')
  .split(path.sep)
  .join('/');

const PADRAO_SQLITE = `file:${CAMINHO_SQLITE}`;

/** URL do banco de teste. Sobrescreva com TEST_DATABASE_URL (ex.: MySQL). */
const URL_TESTE = process.env.TEST_DATABASE_URL || PADRAO_SQLITE;

if (/dev\.db/i.test(URL_TESTE)) {
  throw new Error(
    'TEST_DATABASE_URL aponta para o banco de desenvolvimento (dev.db). ' +
    'Os testes de integração apagam as tabelas — use outro banco.'
  );
}

// O client pode ter sido gerado a partir do schema de produção (DATABASE_URL)
// ou do schema de desenvolvimento (DEV_DATABASE_URL). Definimos os dois.
process.env.DATABASE_URL     = URL_TESTE;
process.env.DEV_DATABASE_URL = URL_TESTE;

process.env.NODE_ENV       = 'test';
process.env.JWT_SECRET     = process.env.JWT_SECRET     || 'jwt_secret_teste';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'session_secret_teste';

module.exports = { URL_TESTE, PADRAO_SQLITE };
