const crypto = require('crypto');
const prisma = require('../config/database');

/**
 * Módulo 6 — o cliente acompanha a entrega no mapa (regras RN26 a RN32).
 *
 * Caminho do cliente: consulta pública da OS → "Seu equipamento saiu para
 * entrega" → 4 últimos dígitos do telefone → mapa. O mapa consulta
 * `GET /rastreio/:token/posicao`, que devolve só a posição do entregador e o
 * destino desta entrega.
 *
 * O aviso ao cliente sai do celular do entregador, por um link do WhatsApp
 * (`wa.me`) com a mensagem pronta — sem API, conta nem custo.
 */

function erro(mensagem, status = 400) {
  return Object.assign(new Error(mensagem), { status });
}

const soDigitos = (v) => String(v || '').replace(/\D/g, '');

// ---------------------------------------------------------------- WhatsApp

/**
 * Número no formato do `wa.me`: só dígitos, com o 55 do Brasil.
 * Prefere o celular; sem ele, usa o fixo e avisa que pode não ter WhatsApp.
 * Devolve `{ numero, fixo }` ou `null` quando não há telefone utilizável.
 */
function numeroWhatsApp(cliente) {
  if (!cliente) return null;
  for (const [campo, fixo] of [['celular', false], ['telefone', true]]) {
    const d = soDigitos(cliente[campo]);
    if (d.length === 10 || d.length === 11) return { numero: `55${d}`, fixo };      // DDD + número
    if (d.startsWith('55') && (d.length === 12 || d.length === 13)) return { numero: d, fixo };
  }
  return null;
}

/** Texto sugerido. O entregador pode editar antes de enviar. */
function mensagemWhatsApp({ nomeCliente, numeroOS, url }) {
  return `Olá, ${nomeCliente}! Seu equipamento da ${numeroOS} saiu para entrega. ` +
    `Acompanhe pelo link: ${url} — vai pedir os 4 últimos dígitos do seu telefone.`;
}

/**
 * Link "Avisar no WhatsApp" de uma parada. `urlBase` é o endereço público do
 * sistema (variável URL_PUBLICA ou a origem da própria requisição).
 * Devolve `{ href, fixo }` ou `null`.
 */
function linkWhatsApp(entrega, urlBase) {
  const cliente = entrega.ordem.equipamento.cliente;
  const tel = numeroWhatsApp(cliente);
  if (!tel) return null;
  const url = `${String(urlBase).replace(/\/+$/, '')}/consulta?numero=${encodeURIComponent(entrega.ordem.numero)}`;
  const texto = mensagemWhatsApp({ nomeCliente: cliente.nome, numeroOS: entrega.ordem.numero, url });
  return { href: `https://wa.me/${tel.numero}?text=${encodeURIComponent(texto)}`, fixo: tel.fixo };
}

// ------------------------------------------------------- verificação (RN27)

/** RN31: há algum telefone para conferir os dígitos? */
function temTelefone(cliente) {
  return Boolean(cliente) && (soDigitos(cliente.celular).length >= 4 || soDigitos(cliente.telefone).length >= 4);
}

/** RN27: os 4 dígitos conferem com o fim do celular ou do fixo. */
function digitosConferem(cliente, digitos) {
  const d = soDigitos(digitos);
  if (d.length !== 4 || !cliente) return false;
  return [cliente.celular, cliente.telefone]
    .map(soDigitos)
    .some((tel) => tel.length >= 4 && tel.slice(-4) === d);
}

// ------------------------------------------------------------------- token

const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

/** RN29: token novo, 32 bytes. Só o hash vai para o banco. */
function gerarToken() {
  const token = crypto.randomBytes(32).toString('hex');
  return { token, hash: hashToken(token) };
}

// ------------------------------------------------------------- consultas

/** RN26: a entrega da OS que está pendente numa saída em rota, se houver. */
async function entregaEmRota(ordemId) {
  return prisma.entregaOS.findFirst({
    where:   { ordemId, status: 'PENDENTE', saida: { status: 'EM_ROTA' } },
    include: { ordem: { include: { equipamento: { include: { cliente: true } } } } },
  });
}

/**
 * O que a consulta pública mostra sobre a entrega da OS.
 * `emRota`: há entrega a acompanhar (RN26). `temTelefone`: dá para verificar
 * (RN31). `entregueEm`: a última entrega concluída (RN32).
 */
async function situacaoDaOrdem(ordemId) {
  const [pendente, entregue] = await Promise.all([
    entregaEmRota(ordemId),
    prisma.entregaOS.findFirst({
      where:   { ordemId, status: 'ENTREGUE' },
      orderBy: { entregueEm: 'desc' },
      select:  { entregueEm: true },
    }),
  ]);
  return {
    emRota:      Boolean(pendente),
    temTelefone: pendente ? temTelefone(pendente.ordem.equipamento.cliente) : false,
    entregueEm:  entregue ? entregue.entregueEm : null,
  };
}

/**
 * RN27 e RN29 — confere os dígitos e, se baterem, gera o token do mapa.
 * Uma nova verificação substitui o token anterior: a aba antiga para de
 * atualizar e pede os dígitos de novo. Devolve `{ token, ordem }`.
 */
async function verificar(numeroOS, digitos) {
  const ordem = await prisma.ordemServico.findUnique({ where: { numero: String(numeroOS || '').trim() } });
  if (!ordem) throw erro('Ordem de serviço não encontrada.', 404);

  const entrega = await entregaEmRota(ordem.id);
  if (!entrega) throw erro('Esta OS não está em rota de entrega agora.');

  const cliente = entrega.ordem.equipamento.cliente;
  if (!temTelefone(cliente)) {
    throw erro('Para acompanhar a entrega, fale com a loja.'); // RN31
  }
  if (!digitosConferem(cliente, digitos)) {
    throw erro('Os dígitos não conferem com o telefone cadastrado.');
  }

  const { token, hash } = gerarToken();
  await prisma.entregaOS.update({ where: { id: entrega.id }, data: { tokenHash: hash } });
  return { token, ordem };
}

/**
 * RN30 — posição pública. Só estes campos saem: nada de nome do entregador,
 * outros destinos ou trajeto. Token inválido, de outra entrega já concluída
 * ou de saída encerrada → `null`, e a rota responde 404 genérico.
 */
async function posicaoPublica(token) {
  if (!/^[0-9a-f]{64}$/.test(String(token || ''))) return null;

  const entrega = await prisma.entregaOS.findFirst({
    where:   { tokenHash: hashToken(token), status: 'PENDENTE', saida: { status: 'EM_ROTA' } },
    select:  { saidaId: true, destinoLat: true, destinoLng: true },
  });
  if (!entrega) return null;

  const ultima = await prisma.posicaoEntrega.findFirst({
    where:   { saidaId: entrega.saidaId },
    orderBy: { registradaEm: 'desc' },
    select:  { lat: true, lng: true, registradaEm: true },
  });

  const num = (v) => (v === null || v === undefined ? null : Number(v));
  return {
    lat:         ultima ? num(ultima.lat) : null,
    lng:         ultima ? num(ultima.lng) : null,
    atualizadoEm: ultima ? ultima.registradaEm : null,
    destino:     entrega.destinoLat === null ? null : { lat: num(entrega.destinoLat), lng: num(entrega.destinoLng) },
    status:      'EM_ROTA',
  };
}

module.exports = {
  numeroWhatsApp,
  mensagemWhatsApp,
  linkWhatsApp,
  temTelefone,
  digitosConferem,
  hashToken,
  gerarToken,
  situacaoDaOrdem,
  verificar,
  posicaoPublica,
};
