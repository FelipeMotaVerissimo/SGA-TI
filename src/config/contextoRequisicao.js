const { AsyncLocalStorage } = require('async_hooks');

/**
 * NF005 — contexto da requisição em curso.
 *
 * O problema: o log de auditoria precisa saber QUEM fez a operação e de qual IP,
 * mas quem intercepta a operação é o Prisma, que não conhece `req`. Passar o
 * usuário de controller em controller até o service devolveria exatamente o que
 * o requisito quer evitar — depender de o desenvolvedor lembrar de repassar.
 *
 * A solução é o `AsyncLocalStorage` do Node: o middleware abre um escopo por
 * requisição e tudo que acontece dentro dela, por mais fundo que esteja na
 * pilha de chamadas assíncronas, enxerga o mesmo contexto.
 *
 * Fora de uma requisição — seed, script, teste unitário — `obter()` devolve
 * `null`, e o log é gravado sem usuário. Isso é informação verdadeira: aquela
 * alteração não veio de ninguém logado.
 */
const armazenamento = new AsyncLocalStorage();

/** Abre o escopo da requisição e executa `fn` dentro dele. */
function executarNoContexto(contextoInicial, fn) {
  return armazenamento.run({ ...contextoInicial }, fn);
}

/** Contexto atual, ou `null` fora de uma requisição. */
function obter() {
  return armazenamento.getStore() || null;
}

/**
 * Registra o usuário no contexto já aberto.
 *
 * Existe porque a identidade só é conhecida depois da autenticação: nas telas
 * ela vem da sessão, na API vem do JWT, e cada uma é resolvida por um
 * middleware diferente. O objeto do contexto é mutável de propósito.
 */
function definirUsuario(usuarioId) {
  const contexto = armazenamento.getStore();
  if (contexto) contexto.usuarioId = usuarioId ? Number(usuarioId) : null;
}

module.exports = { executarNoContexto, obter, definirUsuario };
