#!/usr/bin/env node
/**
 * Módulo 6 — gera o trajeto do simulador de entrega (scripts/simular-entrega.js).
 *
 * Pede ao OSRM público a rota de carro entre a partida e cada parada, sobre as
 * ruas do OpenStreetMap, e reamostra a linha num ponto a cada ~70 m (perto do
 * que um carro anda em 10 s na cidade). O último ponto de cada trecho é
 * marcado como parada.
 *
 * Roda uma vez, com rede, por quem prepara a demonstração. O resultado fica
 * versionado em scripts/trajetos/; o simulador e os testes não usam rede.
 *
 * Uso:
 *   node scripts/gerar-trajeto.js --partida LAT,LNG --parada LAT,LNG [--parada LAT,LNG ...]
 *                                 [--saida scripts/trajetos/novo.json] [--passo 70]
 */

const fs   = require('fs');
const path = require('path');

const OSRM = 'https://router.project-osrm.org/route/v1/driving/';
const USER_AGENT = 'SGA-TI/1.0 (TCC UNIGRAN; gerador de trajeto de demonstracao)';
const RAIO_TERRA_M = 6371000;

/** Distância em metros entre dois pontos {lat, lng} (haversine). */
function distanciaMetros(a, b) {
  const rad = (g) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * RAIO_TERRA_M * Math.asin(Math.sqrt(h));
}

const arredondar = (v) => Math.round(v * 1e6) / 1e6; // a coluna guarda 6 casas

/**
 * Reamostra uma linha num ponto a cada `passo` metros, andando sobre ela. O
 * primeiro e o último ponto da linha original sempre entram.
 */
function reamostrar(linha, passo) {
  if (linha.length < 2) return linha.map((p) => ({ lat: arredondar(p.lat), lng: arredondar(p.lng) }));
  const saida = [linha[0]];
  let falta = passo;
  for (let i = 1; i < linha.length; i++) {
    let a = linha[i - 1];
    const b = linha[i];
    let d = distanciaMetros(a, b);
    while (d >= falta && d > 0) {
      const t = falta / d;
      a = { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
      saida.push(a);
      d -= falta;
      falta = passo;
    }
    falta -= d;
  }
  const ultimo = linha[linha.length - 1];
  if (distanciaMetros(saida[saida.length - 1], ultimo) > 1) saida.push(ultimo);
  return saida.map((p) => ({ lat: arredondar(p.lat), lng: arredondar(p.lng) }));
}

function lerPonto(texto, nome) {
  const [lat, lng] = String(texto || '').split(',').map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error(`${nome} inválida: use LAT,LNG.`);
  return { lat, lng };
}

function lerArgumentos(argv) {
  const args = { paradas: [], saida: 'scripts/trajetos/dourados-demo.json', passo: 70 };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i + 1];
    if (argv[i] === '--partida') { args.partida = lerPonto(v, 'Partida'); i++; }
    else if (argv[i] === '--parada') { args.paradas.push(lerPonto(v, 'Parada')); i++; }
    else if (argv[i] === '--saida') { args.saida = v; i++; }
    else if (argv[i] === '--passo') { args.passo = Number(v); i++; }
    else throw new Error(`Argumento desconhecido: ${argv[i]}`);
  }
  if (!args.partida) throw new Error('Informe --partida LAT,LNG.');
  if (args.paradas.length === 0) throw new Error('Informe ao menos uma --parada LAT,LNG.');
  if (!(args.passo >= 10)) throw new Error('--passo precisa ser de pelo menos 10 m.');
  return args;
}

/** Rota de carro de `a` até `b` pelo OSRM, como lista de {lat, lng}. */
async function rota(a, b) {
  const url = `${OSRM}${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`OSRM respondeu ${res.status}.`);
  const dados = await res.json();
  if (dados.code !== 'Ok' || !dados.routes || !dados.routes[0]) throw new Error(`OSRM não achou rota (${dados.code}).`);
  return dados.routes[0].geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
}

async function principal() {
  const args = lerArgumentos(process.argv.slice(2));
  const pontos = [];
  let de = args.partida;
  for (const [i, para] of args.paradas.entries()) {
    const trecho = reamostrar(await rota(de, para), args.passo);
    // O primeiro ponto de um trecho é o último do anterior: não repete.
    pontos.push(...(pontos.length ? trecho.slice(1) : trecho));
    pontos[pontos.length - 1].parada = i + 1;
    de = para;
    await new Promise((r) => setTimeout(r, 1000)); // servidor público: uma consulta por segundo
  }

  const trajeto = {
    descricao: 'Trajeto de demonstração do Módulo 6 em Dourados/MS',
    fonte: 'Rota de carro do OSRM (router.project-osrm.org) sobre o OpenStreetMap',
    licenca: '© OpenStreetMap contributors, ODbL',
    geradoEm: new Date().toISOString().slice(0, 10),
    passoMetros: args.passo,
    pontos,
  };
  const destino = path.resolve(args.saida);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, JSON.stringify(trajeto, null, 2) + '\n');
  console.log(`Trajeto gravado em ${destino}: ${pontos.length} pontos, ${args.paradas.length} parada(s).`);
}

if (require.main === module) {
  principal().catch((e) => {
    console.error(`[ERRO] ${e.message}`);
    process.exit(1);
  });
}

module.exports = { distanciaMetros, reamostrar, lerArgumentos };
