/**
 * SGA TI — Servidor de preview.
 *
 * Sobe o app Express REAL (rotas, controllers, services, views, sessão, flash)
 * trocando apenas src/config/database.js pelo fake em memória.
 *
 * Uso:  node sandbox/preview.js [porta]
 *
 * Login de demonstração: admin / admin123
 */

const path = require('path');

// ---- injeta o fake no lugar do Prisma real, antes de qualquer require do app ----
const caminhoReal = require.resolve(path.join(__dirname, '..', 'src', 'config', 'database.js'));
const fake = require('./fakePrisma');
require.cache[caminhoReal] = {
  id: caminhoReal,
  filename: caminhoReal,
  loaded: true,
  exports: fake,
};
// --------------------------------------------------------------------------------

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'preview_sga_ti';
process.env.JWT_SECRET     = process.env.JWT_SECRET     || 'preview_jwt_sga_ti';
process.env.NODE_ENV       = 'preview';

const semear = require('./seedDemo');
const app    = require('../src/app');

const PORTA = Number(process.argv[2] || 3000);

(async () => {
  await semear(fake);

  app.listen(PORTA, '127.0.0.1', () => {
    console.log(`PREVIEW no ar em http://127.0.0.1:${PORTA}`);
    console.log('Login: admin / admin123');
  });
})().catch((e) => {
  console.error('Falha ao subir o preview:', e);
  process.exit(1);
});
