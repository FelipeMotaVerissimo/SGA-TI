#!/usr/bin/env node
/**
 * NF008 — repara clientes anonimizados antes das regras RN06 e RN07.
 *
 * Até a versão de 14/10/2026, a anonimização apagava os dados do cadastro mas
 * deixava o nome do cliente:
 *   - na descrição das contas a receber geradas no faturamento
 *     ("OS 108 — Joana Silva"), e
 *   - no log de auditoria, tanto do cliente quanto dessas contas.
 *
 * Este script aplica a limpeza a TODOS os clientes já anonimizados. É
 * idempotente: rodar de novo não muda nada.
 *
 * Uso:
 *   npm run reparar:anonimizacoes
 */
require('dotenv').config();

const prisma   = require('../src/config/database');
const retencao = require('../src/services/retencaoService');

(async () => {
  const resultado = await retencao.repararTodas();

  if (resultado.length === 0) {
    console.log('Nenhum cliente anonimizado. Nada a reparar.');
  } else {
    console.log(`Clientes anonimizados verificados: ${resultado.length}\n`);
    for (const r of resultado) {
      const total = r.contasRedigidas + r.logClienteRedigidos + r.logContasRedigidos;
      console.log(
        `  cliente #${String(r.clienteId).padEnd(6)} ` +
        `contas: ${r.contasRedigidas} | log do cliente: ${r.logClienteRedigidos} | ` +
        `log das contas: ${r.logContasRedigidos}` +
        (total === 0 ? '   (já estava limpo)' : '')
      );
    }
  }
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error('[ERRO]', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
