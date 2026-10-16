/**
 * Módulo 6 — geocodificação do endereço do cliente.
 *
 * Converte o endereço cadastrado em latitude/longitude, uma vez por entrega,
 * usando o Nominatim (OpenStreetMap): grátis, sem chave nem cartão.
 *
 * A política de uso do Nominatim exige:
 *  - no máximo **1 requisição por segundo** — garantido pela fila abaixo, que
 *    vale para o processo inteiro, e não por chamada;
 *  - um `User-Agent` que identifique o aplicativo; o contato (e-mail) vem de
 *    `NOMINATIM_CONTATO`, opcional, para não publicar e-mail no repositório.
 *
 * Falhar aqui nunca impede a entrega: sem coordenada, o cliente vê só o
 * entregador, sem o pino de destino. Por isso as funções devolvem `null` em
 * vez de lançar erro.
 */

const URL_NOMINATIM   = 'https://nominatim.openstreetmap.org/search';
const TIMEOUT_MS      = 5000;
const INTERVALO_MS    = 1000;   // política do Nominatim: 1 requisição/s
let intervaloMs       = INTERVALO_MS;

function userAgent() {
  const contato = String(process.env.NOMINATIM_CONTATO || '').trim();
  return `SGA-TI/1.0 (TCC UNIGRAN${contato ? `; ${contato}` : ''})`;
}

/**
 * Parâmetros da busca estruturada, a partir do cadastro do cliente.
 * Estruturada é mais precisa que texto livre: o Nominatim sabe que "Dourados"
 * é a cidade e não um nome de rua. Campos vazios ficam de fora.
 *
 * **O CEP só entra quando falta a cidade.** A base de CEPs do OpenStreetMap no
 * Brasil é fraca: com o CEP genérico da cidade (79830-000), a busca por uma rua
 * que existe voltou vazia; sem o CEP, achou a rua. Descoberto no navegador, com
 * o Nominatim de verdade — os testes, com o `fetch` simulado, não pegariam.
 *
 * Devolve `null` quando não há endereço suficiente para buscar.
 */
function montarConsulta(cliente) {
  if (!cliente) return null;
  const limpo = (v) => String(v || '').trim();

  const rua    = [limpo(cliente.numero), limpo(cliente.endereco)].filter(Boolean).join(' ');
  const cidade = limpo(cliente.cidade);
  const estado = limpo(cliente.estado);
  const cep    = limpo(cliente.cep);

  // Sem rua não há destino útil; sem cidade nem CEP, a rua sozinha é ambígua.
  if (!limpo(cliente.endereco) || (!cidade && !cep)) return null;

  const params = { format: 'jsonv2', limit: '1', countrycodes: 'br', street: rua };
  if (cidade) params.city = cidade;
  if (estado) params.state = estado;
  if (cep && !cidade) params.postalcode = cep;
  return params;
}

/** Uma chamada ao Nominatim. `{ lat, lng }` ou `null`. */
async function consultar(params, fetchImpl = globalThis.fetch) {
  const url = `${URL_NOMINATIM}?${new URLSearchParams(params)}`;
  try {
    const res = await fetchImpl(url, {
      headers: { 'User-Agent': userAgent(), 'Accept-Language': 'pt-BR' },
      signal:  AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return avisar(`HTTP ${res.status}`);

    const dados = await res.json();
    if (!Array.isArray(dados) || dados.length === 0) return avisar('endereço não encontrado');

    const lat = Number(dados[0].lat);
    const lng = Number(dados[0].lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch (e) {
    // Timeout, rede fora, JSON inválido: tudo vira "sem coordenada".
    return avisar(`${e.name}: ${e.message}`);
  }
}

/**
 * A falha não interrompe nada, mas precisa deixar rastro no log do servidor —
 * senão o pino de destino some sem ninguém saber por quê. Só o motivo vai para
 * o log, nunca o endereço: é dado pessoal.
 */
function avisar(motivo) {
  if (process.env.NODE_ENV !== 'test') console.warn(`[geocodificacao] sem coordenada: ${motivo}`);
  return null;
}

// ------------------------------------------------------------------ fila
// Uma promessa encadeada: cada busca espera a anterior e o intervalo mínimo.
let fila = Promise.resolve();
let ultimaChamada = 0;
const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));

/**
 * Geocodifica o endereço do cliente, respeitando o intervalo do Nominatim.
 * Devolve `{ lat, lng }` ou `null`. Nunca lança.
 */
function geocodificar(cliente, { fetchImpl } = {}) {
  const params = montarConsulta(cliente);
  if (!params) return Promise.resolve(null);

  const tarefa = fila.then(async () => {
    const falta = ultimaChamada + intervaloMs - Date.now();
    if (falta > 0) await espera(falta);
    ultimaChamada = Date.now();
    return consultar(params, fetchImpl);
  });
  fila = tarefa.catch(() => null);
  return tarefa;
}

/**
 * Só para os testes: zera a fila e o relógio, e permite encurtar o intervalo.
 * Em produção o intervalo é sempre o da política (1 s).
 */
function _reiniciarFila({ intervalo = INTERVALO_MS } = {}) {
  fila = Promise.resolve();
  ultimaChamada = 0;
  intervaloMs = intervalo;
}

module.exports = {
  URL_NOMINATIM,
  TIMEOUT_MS,
  INTERVALO_MS,
  userAgent,
  montarConsulta,
  consultar,
  geocodificar,
  _reiniciarFila,
};
