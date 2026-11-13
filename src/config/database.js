const { PrismaClient } = require('@prisma/client');
const { criarExtensao, transacaoAtual } = require('../services/auditoriaExtensao');

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
const estendido = clienteBase.$extends(criarExtensao(clienteBase));

/**
 * `$transaction` interativa (com função) guarda o cliente da transação em
 * `transacaoAtual`, para a auditoria ler o valor anterior pela mesma conexão
 * em vez de pedir outra ao pool — ver o cabeçalho de auditoriaExtensao.js.
 * A forma com lista de operações não muda.
 */
function $transaction(arg, opcoes) {
  if (typeof arg !== 'function') return estendido.$transaction(arg, opcoes);
  return estendido.$transaction((tx) => transacaoAtual.run(tx, () => arg(tx)), opcoes);
}

const prisma = new Proxy(estendido, {
  get(alvo, prop) {
    if (prop === '$transaction') return $transaction;
    return Reflect.get(alvo, prop, alvo);
  },
});

module.exports = prisma;
