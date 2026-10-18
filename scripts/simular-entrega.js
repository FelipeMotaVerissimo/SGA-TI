#!/usr/bin/env node
/**
 * Módulo 6 — simulador de entrega para a demonstração.
 *
 * Move o entregador da saída em rota por um trajeto de ruas reais de
 * Dourados/MS, gravando uma posição a cada `--intervalo` segundos. O painel do
 * administrador e a consulta do cliente acompanham como se fosse o GPS do
 * celular: é a garantia da banca, que não depende de sinal dentro da sala.
 *
 * Não inicia a saída nem marca entregas: isso se faz na tela do entregador,
 * como no uso real. É opcional — o sistema não depende dele.
 *
 * Uso:
 *   npm run simular:entrega -- [--intervalo 10] [--pausa 30] [--repetir]
 *                              [--trajeto scripts/trajetos/dourados-demo.json] [--confirmar]
 *
 * O trajeto é gerado por scripts/gerar-trajeto.js.
 */

const fs   = require('fs');
const path = require('path');

require('dotenv').config();

const { validarPosicao } = require('../src/services/entregaService');

const TRAJETO_PADRAO = path.join(__dirname, 'trajetos', 'dourados-demo.json');
const INTERVALO_PADRAO_S = 10; // o mesmo do celular
const PAUSA_PADRAO_S = 30;     // parado em cada parada do trajeto

function erro(mensagem) {
  return new Error(mensagem);
}

function lerNumero(texto, nome, minimo) {
  const n = Number(texto);
  if (texto === undefined || !Number.isFinite(n) || n < minimo) {
    throw erro(`${nome} precisa ser um número de pelo menos ${minimo}.`);
  }
  return n;
}

function lerArgumentos(argv) {
  const args = {
    intervalo: INTERVALO_PADRAO_S,
    pausa:     PAUSA_PADRAO_S,
    trajeto:   TRAJETO_PADRAO,
    repetir:   false,
    confirmar: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i + 1];
    switch (argv[i]) {
      case '--intervalo': args.intervalo = lerNumero(v, '--intervalo', 1); i++; break;
      case '--pausa':     args.pausa = lerNumero(v, '--pausa', 0); i++; break;
      case '--trajeto':   if (!v) throw erro('--trajeto precisa do caminho do arquivo.'); args.trajeto = path.resolve(v); i++; break;
      case '--repetir':   args.repetir = true; break;
      case '--confirmar': args.confirmar = true; break;
      default: throw erro(`Argumento desconhecido: ${argv[i]}`);
    }
  }
  return args;
}

/**
 * Em produção, a posição gravada aparece para o cliente de verdade: um
 * entregador falso andando no mapa dele. Só com --confirmar.
 */
function verificarAmbiente(env, args) {
  if (env.NODE_ENV === 'production' && !args.confirmar) {
    throw erro('NODE_ENV=production: o cliente veria um entregador simulado. Use --confirmar se é isso mesmo.');
  }
}

/** Confere o trajeto com a mesma regra da posição do celular (RN20). */
function validarTrajeto(dados) {
  const pontos = dados && dados.pontos;
  if (!Array.isArray(pontos) || pontos.length < 2) throw erro('O trajeto precisa de pelo menos 2 pontos.');
  return pontos.map((p, i) => {
    try {
      const { lat, lng } = validarPosicao(p);
      return { lat, lng, parada: p.parada || null };
    } catch (e) {
      throw erro(`Ponto ${i + 1} do trajeto: ${e.message}`);
    }
  });
}

function carregarTrajeto(arquivo) {
  let dados;
  try {
    dados = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  } catch (e) {
    throw erro(`Não foi possível ler o trajeto ${arquivo}: ${e.message}`);
  }
  return validarTrajeto(dados);
}

const dormirDeVerdade = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Grava os pontos, em ordem, na saída em rota. Para quando o trajeto acaba
 * (ou recomeça, com `repetir`) e quando a saída deixa de estar em rota.
 * `dormir` e `log` são trocados nos testes.
 */
async function simular({ prisma, pontos, intervalo = INTERVALO_PADRAO_S, pausa = PAUSA_PADRAO_S,
  repetir = false, dormir = dormirDeVerdade, log = console.log }) {
  const saida = await prisma.saidaEntrega.findUnique({
    where:   { emRota: true },
    include: { entregador: { select: { nome: true } } },
  });
  if (!saida) throw erro('Não há saída em rota. Inicie a saída na tela do entregador (/entregas/saida) e rode de novo.');
  log(`Simulando a saída #${saida.id} (${saida.entregador.nome}): ${pontos.length} pontos, um a cada ${intervalo} s.`);

  let gravadas = 0;
  let ultimaNossa = null;
  let avisou = false;

  do {
    for (const ponto of pontos) {
      const atual = await prisma.saidaEntrega.findUnique({ where: { id: saida.id }, select: { status: true } });
      if (!atual || atual.status !== 'EM_ROTA') {
        log(`A saída #${saida.id} não está mais em rota. Fim da simulação.`);
        return { gravadas, motivo: 'saida-fora-de-rota' };
      }

      // Outra fonte gravando ao mesmo tempo (um celular com GPS ligado) faz o
      // marcador pular entre os dois pontos no mapa.
      if (ultimaNossa && !avisou) {
        const ultima = await prisma.posicaoEntrega.findFirst({
          where: { saidaId: saida.id }, orderBy: { registradaEm: 'desc' }, select: { id: true },
        });
        if (ultima && ultima.id !== ultimaNossa) {
          log('Atenção: outra posição foi gravada nesta saída (celular com GPS ligado?). O marcador vai pular entre as duas.');
          avisou = true;
        }
      }

      const criada = await prisma.posicaoEntrega.create({
        data: { saidaId: saida.id, lat: ponto.lat, lng: ponto.lng, precisao: null },
      });
      ultimaNossa = criada.id;
      gravadas++;

      if (ponto.parada) log(`Parada ${ponto.parada}: aguardando ${pausa} s.`);
      await dormir((ponto.parada ? pausa : intervalo) * 1000);
    }
  } while (repetir);

  log(`Fim do trajeto: ${gravadas} posições gravadas.`);
  return { gravadas, motivo: 'fim-do-trajeto' };
}

async function principal() {
  const args = lerArgumentos(process.argv.slice(2));
  verificarAmbiente(process.env, args);
  const pontos = carregarTrajeto(args.trajeto);

  // Cliente próprio, sem o log de SQL que o sistema liga em desenvolvimento:
  // com ele, as mensagens da simulação se perdiam no terminal (visto rodando).
  // Não perde auditoria: as posições já ficam fora dela.
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient({ log: ['warn', 'error'] });
  process.on('SIGINT', async () => {
    console.log('\nSimulação interrompida.');
    await prisma.$disconnect();
    process.exit(0);
  });
  try {
    await simular({ prisma, pontos, intervalo: args.intervalo, pausa: args.pausa, repetir: args.repetir });
  } finally {
    await prisma.$disconnect();
  }
}

// Só roda quando chamado direto. Importado pelos testes, não executa nada.
if (require.main === module) {
  principal().catch((e) => {
    console.error(`[ERRO] ${e.message}`);
    process.exit(1);
  });
}

module.exports = {
  TRAJETO_PADRAO, INTERVALO_PADRAO_S, PAUSA_PADRAO_S,
  lerArgumentos, verificarAmbiente, validarTrajeto, carregarTrajeto, simular,
};
