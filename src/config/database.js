const { PrismaClient } = require('@prisma/client');
const { criarExtensao } = require('../services/auditoriaExtensao');

const clienteBase = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['error'],
});

/**
 * NF005 — o cliente exportado é o **estendido**: toda escrita feita por
 * qualquer service passa pela auditoria, sem que o service precise saber disso.
 *
 * A extensão recebe o cliente base para gravar o log, porque gravar com o
 * estendido faria a própria gravação disparar a extensão outra vez.
 */
const prisma = clienteBase.$extends(criarExtensao(clienteBase));

module.exports = prisma;
