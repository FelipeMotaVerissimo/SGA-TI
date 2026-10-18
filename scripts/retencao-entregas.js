#!/usr/bin/env node
/**
 * Módulo 6 — retenção do trajeto das entregas (RN35 e RN36).
 *
 * Apaga as posições das saídas encerradas ou canceladas há mais de 30 dias
 * `[VALIDAR]` e anula o destino das entregas delas. A mesma limpeza roda
 * sozinha a cada saída iniciada; este script é para rodar à mão. Idempotente:
 * rodar de novo não muda nada.
 *
 * Uso:
 *   npm run retencao:entregas
 */
require('dotenv').config();

const prisma   = require('../src/config/database');
const retencao = require('../src/services/retencaoService');

(async () => {
  const r = await retencao.limparTrajetosAntigos();
  console.log(`Saídas encerradas antes de ${r.corte.toLocaleDateString('pt-BR')} (${retencao.DIAS_RETENCAO_TRAJETO} dias):`);
  console.log(`  posições apagadas: ${r.posicoesApagadas}`);
  console.log(`  destinos anulados: ${r.destinosAnulados}`);
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error('[ERRO]', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
