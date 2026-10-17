/**
 * Módulo 6 — mapa da entrega na consulta pública.
 *
 * Arquivo próprio, e não <script> embutido, por causa do CSP (NF007). O
 * Leaflet é servido pelo próprio sistema (/vendor/leaflet); só os tiles vêm
 * do OpenStreetMap, e o CSP libera só esse endereço em img-src.
 *
 * A cada 10 s consulta GET /rastreio/:token/posicao. 404 encerra o
 * acompanhamento: entrega concluída, saída encerrada ou token substituído por
 * uma verificação mais nova.
 *
 * As regras de texto ficam em funções puras, exportadas no fim para os testes
 * rodarem no Node (tests/unit/rastreioScript.test.js).
 */
(function () {
  'use strict';

  var INTERVALO_MS = 10000;
  var CENTRO_PADRAO = [-22.2211, -54.8056]; // Dourados/MS, antes da 1ª posição

  // ------------------------------------------------------- funções puras

  /** Texto da linha de status, a partir da idade da última posição. */
  function descreverAtualizacao(ms) {
    if (ms === null || ms === undefined) return 'Aguardando a primeira localização do entregador…';
    var s = Math.max(0, Math.floor(ms / 1000));
    if (s < 60) return 'Localização do entregador atualizada há ' + s + ' s';
    return 'Localização do entregador atualizada há ' + Math.floor(s / 60) + ' min';
  }

  /**
   * O que fazer com a resposta. 404 é o fim do acompanhamento — o servidor
   * não diz por quê, de propósito (RN30).
   */
  function interpretar(status) {
    if (status === 200) return 'atualizar';
    if (status === 404) return 'encerrar';
    return 'tentar-de-novo';
  }

  var api = { INTERVALO_MS: INTERVALO_MS, descreverAtualizacao: descreverAtualizacao, interpretar: interpretar };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;   // Node (testes)
    return;
  }

  // ------------------------------------------------------- navegador

  function iniciar() {
    var el = document.getElementById('mapa-entrega');
    var status = document.querySelector('.mapa-status');
    if (!el || !status) return;
    if (!window.L) { status.textContent = 'Não foi possível carregar o mapa.'; return; }

    var token = el.getAttribute('data-token');
    var L = window.L;
    L.Icon.Default.imagePath = '/vendor/leaflet/images/';

    var mapa = L.map(el).setView(CENTRO_PADRAO, 14);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      // O sistema manda Referrer-Policy: same-origin, e a política de uso dos
      // tiles do OSM exige Referer. Aqui vai só a origem, nunca a URL inteira.
      referrerPolicy: 'strict-origin-when-cross-origin',
    }).addTo(mapa);

    var entregador = null;
    var destino = null;
    var enquadrado = false;
    var ultimaPosicao = null;
    var relogios = [];

    function encerrar(texto) {
      relogios.forEach(clearInterval);
      status.textContent = texto;
      status.className = 'mapa-status mapa-encerrado';
    }

    function desenhar(d) {
      if (d.destino && !destino) {
        destino = L.marker([d.destino.lat, d.destino.lng], { title: 'Destino' }).addTo(mapa);
      }
      if (d.lat !== null && d.lng !== null) {
        if (!entregador) {
          entregador = L.circleMarker([d.lat, d.lng], {
            radius: 10, color: '#fff', weight: 3, fillColor: '#185FA5', fillOpacity: 1,
          }).addTo(mapa);
        } else {
          entregador.setLatLng([d.lat, d.lng]);
        }
        ultimaPosicao = new Date(d.atualizadoEm).getTime();
      }
      // Enquadra uma vez, quando já houver os dois pontos (ou só o que houver).
      if (!enquadrado) {
        var pontos = [];
        if (entregador) pontos.push(entregador.getLatLng());
        if (destino) pontos.push(destino.getLatLng());
        if (pontos.length === 2) { mapa.fitBounds(L.latLngBounds(pontos), { padding: [40, 40] }); enquadrado = true; }
        else if (pontos.length === 1) mapa.setView(pontos[0], 15);
      }
    }

    function atualizar() {
      fetch('/rastreio/' + encodeURIComponent(token) + '/posicao', { cache: 'no-store' })
        .then(function (res) {
          var acao = interpretar(res.status);
          if (acao === 'encerrar') {
            encerrar('Acompanhamento encerrado. Consulte a OS de novo para ver a situação da entrega.');
            return null;
          }
          if (acao !== 'atualizar') throw new Error('status ' + res.status);
          return res.json();
        })
        .then(function (d) { if (d) desenhar(d); })
        .catch(function () {
          status.textContent = 'Sem conexão no momento. Tentando de novo…';
        });
    }

    // Se o mapa nasceu com a aba escondida (link aberto em segundo plano), o
    // Leaflet não sabe o tamanho e desenha só um canto. Ao voltar a ficar
    // visível, recalcula. Visto no navegador.
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') mapa.invalidateSize();
    });

    relogios.push(setInterval(atualizar, INTERVALO_MS));
    relogios.push(setInterval(function () {
      if (status.className.indexOf('mapa-encerrado') !== -1) return;
      status.textContent = descreverAtualizacao(ultimaPosicao === null ? null : Date.now() - ultimaPosicao);
    }, 1000));
    atualizar();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
