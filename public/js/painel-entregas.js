/**
 * Módulo 6 — mapa do painel de entregas do administrador (RN33/RN34).
 *
 * Arquivo próprio, e não <script> embutido, por causa do CSP (NF007). Os
 * destinos chegam no atributo data-destinos da página; a cada 10 s consulta
 * GET /entregas/painel/posicao para mover o entregador e recolorir os pinos.
 * 404 quer dizer que a saída não está mais em rota: a atualização para.
 *
 * As regras de texto ficam em funções puras, exportadas no fim para os testes
 * rodarem no Node (tests/unit/painelEntregasScript.test.js).
 */
(function () {
  'use strict';

  var INTERVALO_MS = 10000;
  var CENTRO_PADRAO = [-22.2211, -54.8056]; // Dourados/MS
  var ROTULO = { PENDENTE: 'Pendente', ENTREGUE: 'Entregue', NAO_ENTREGUE: 'Não entregue' };
  var COR    = { PENDENTE: 'badge-amarelo', ENTREGUE: 'badge-verde', NAO_ENTREGUE: 'badge-vermelho' };

  // ------------------------------------------------------- funções puras

  /** Texto da linha de status, a partir da idade da última posição. */
  function descreverAtualizacao(ms) {
    if (ms === null || ms === undefined) return 'O entregador ainda não enviou a localização.';
    var s = Math.max(0, Math.floor(ms / 1000));
    if (s < 60) return 'Localização do entregador há ' + s + ' s';
    return 'Localização do entregador há ' + Math.floor(s / 60) + ' min';
  }

  /**
   * O que fazer com a resposta: 404 é saída fora de rota. Sessão expirada não
   * dá erro: o fetch segue o redirecionamento e recebe a tela de login com
   * 200 — visto no navegador, onde o mapa ficava parado sem explicação.
   */
  function interpretar(status, redirecionado) {
    if (redirecionado) return 'sessao-expirada';
    if (status === 200) return 'atualizar';
    if (status === 404) return 'encerrar';
    return 'tentar-de-novo';
  }

  /** Classe do pino numerado; status desconhecido cai em pendente. */
  function classePino(status) {
    return 'pino-parada pino-' + (ROTULO[status] ? status : 'PENDENTE');
  }

  var api = {
    INTERVALO_MS: INTERVALO_MS,
    descreverAtualizacao: descreverAtualizacao,
    interpretar: interpretar,
    classePino: classePino,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;   // Node (testes)
    return;
  }

  // ------------------------------------------------------- navegador

  function iniciar() {
    var el = document.getElementById('mapa-painel');
    var status = document.querySelector('.mapa-status');
    if (!el || !status) return;
    if (!window.L) { status.textContent = 'Não foi possível carregar o mapa.'; return; }

    var L = window.L;
    var destinos = [];
    try { destinos = JSON.parse(el.getAttribute('data-destinos') || '[]'); } catch (e) { destinos = []; }

    var mapa = L.map(el).setView(CENTRO_PADRAO, 13);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      // Como no rastreio do cliente: o Referer vai só com a origem.
      referrerPolicy: 'strict-origin-when-cross-origin',
    }).addTo(mapa);

    // Um pino numerado por destino; a cor segue o status da parada. O Leaflet
    // põe `html` como marcação, por isso só entra o número, nunca texto de cadastro.
    var pinos = {};
    destinos.forEach(function (d) {
      var icone = L.divIcon({ className: classePino(d.status), html: String(Number(d.parada)), iconSize: [26, 26] });
      pinos[d.id] = L.marker([d.lat, d.lng], { icon: icone, title: 'Parada ' + d.parada + ' — ' + d.os }).addTo(mapa);
    });

    var entregador = null;
    var enquadrado = false;
    var ultimaPosicao = null;
    var semConexao = false;
    var relogios = [];

    // Sem animação: com a aba em segundo plano o navegador pausa a animação do
    // zoom no meio, e as duas camadas de tiles sobrepostas deixam o mapa
    // desbotado (visto no navegador).
    function enquadrar() {
      var pontos = Object.keys(pinos).map(function (id) { return pinos[id].getLatLng(); });
      if (entregador) pontos.push(entregador.getLatLng());
      if (pontos.length > 1) mapa.fitBounds(L.latLngBounds(pontos), { padding: [40, 40], maxZoom: 16, animate: false });
      else if (pontos.length === 1) mapa.setView(pontos[0], 15, { animate: false });
    }

    function encerrar(texto, destino, rotuloLink) {
      relogios.forEach(clearInterval);
      status.textContent = '';
      status.appendChild(document.createTextNode(texto + ' '));
      var link = document.createElement('a');
      link.href = destino;
      link.textContent = rotuloLink;
      status.appendChild(link);
      status.className = 'mapa-status mapa-encerrado';
    }

    function atualizarParada(e) {
      if (pinos[e.id]) {
        var icone = pinos[e.id].getElement();
        if (icone) icone.className = icone.className.replace(/pino-(PENDENTE|ENTREGUE|NAO_ENTREGUE)/, 'pino-' + e.status);
      }
      var linha = document.querySelector('tr[data-entrega="' + Number(e.id) + '"]');
      if (!linha) return;
      var numero = linha.querySelector('.pino-parada');
      if (numero) numero.className = classePino(e.status);
      var badge = linha.querySelector('.status-parada');
      if (badge && ROTULO[e.status]) {
        badge.textContent = ROTULO[e.status];
        badge.className = 'badge ' + COR[e.status] + ' status-parada';
      }
    }

    function desenhar(d) {
      if (d.posicao) {
        if (!entregador) {
          entregador = L.circleMarker([d.posicao.lat, d.posicao.lng], {
            radius: 10, color: '#fff', weight: 3, fillColor: '#185FA5', fillOpacity: 1,
          }).addTo(mapa);
        } else {
          entregador.setLatLng([d.posicao.lat, d.posicao.lng]);
        }
        ultimaPosicao = new Date(d.posicao.atualizadoEm).getTime();
      }
      (d.entregas || []).forEach(atualizarParada);
      // Enquadra uma vez com o entregador; antes dele, só os destinos.
      if (!enquadrado && entregador) { enquadrar(); enquadrado = true; }
    }

    function atualizar() {
      fetch('/entregas/painel/posicao', { cache: 'no-store', credentials: 'same-origin' })
        .then(function (res) {
          var acao = interpretar(res.status, res.redirected);
          if (acao === 'encerrar') { encerrar('A saída não está mais em rota.', '/entregas', 'Recarregar o painel'); return null; }
          if (acao === 'sessao-expirada') { encerrar('Sua sessão expirou.', '/login', 'Entrar de novo'); return null; }
          if (acao !== 'atualizar') throw new Error('status ' + res.status);
          return res.json();
        })
        .then(function (d) { if (d) { semConexao = false; desenhar(d); } })
        .catch(function () {
          semConexao = true;
          status.textContent = 'Sem conexão no momento. Tentando de novo…';
        });
    }

    // Mapa criado com a aba escondida desenha só um canto (visto na Etapa 5).
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') mapa.invalidateSize();
    });

    enquadrar();
    relogios.push(setInterval(atualizar, INTERVALO_MS));
    relogios.push(setInterval(function () {
      // Encerrado ou sem conexão: o aviso fica até a próxima resposta.
      if (semConexao || status.className.indexOf('mapa-encerrado') !== -1) return;
      status.textContent = descreverAtualizacao(ultimaPosicao === null ? null : Date.now() - ultimaPosicao);
    }, 1000));
    atualizar();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
