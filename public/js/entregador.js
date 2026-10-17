/**
 * Módulo 6 — envio da posição do entregador durante a saída.
 *
 * Arquivo próprio, e não <script> embutido, por causa do CSP (NF007).
 *
 * Como funciona:
 *  - `watchPosition` guarda a última posição que o GPS informar;
 *  - a cada 10 s, a última posição vai para `POST /entregas/saida/posicao`,
 *    com o token CSRF no cabeçalho (o mesmo do formulário "Sair");
 *  - a faixa do topo mostra há quanto tempo foi o último envio;
 *  - o Wake Lock pede para a tela não apagar. Com a tela bloqueada o navegador
 *    pausa o GPS — rastrear em segundo plano exigiria app nativo.
 *
 * As regras de texto e de reação ficam em funções puras, exportadas no fim
 * para os testes rodarem no Node, sem navegador
 * (tests/unit/entregadorScript.test.js).
 */
(function () {
  'use strict';

  var INTERVALO_ENVIO_MS = 10000;

  // ------------------------------------------------------- funções puras

  /** Texto para cada código de erro da Geolocation API. */
  function mensagemErroGeo(codigo) {
    if (codigo === 1) return 'Permita a localização para o navegador nas configurações do celular.';
    if (codigo === 2) return 'Procurando sinal de GPS…';
    if (codigo === 3) return 'Procurando sinal de GPS… (demorando para responder)';
    return 'Não foi possível ler a localização.';
  }

  /** "há 8 s", "há 3 min" — ou o aviso de que nada foi enviado ainda. */
  function descreverIdade(ms) {
    if (ms === null || ms === undefined || ms < 0) return 'Localização ainda não enviada';
    var s = Math.floor(ms / 1000);
    if (s < 60) return 'Localização enviada há ' + s + ' s';
    return 'Localização enviada há ' + Math.floor(s / 60) + ' min';
  }

  /** Cor da faixa: até 2 ciclos é normal; até 1 min, atenção; depois, falha. */
  function classeIdade(ms) {
    if (ms === null || ms === undefined) return 'gps-atencao';
    if (ms <= 2 * INTERVALO_ENVIO_MS) return 'gps-ok';
    if (ms <= 60000) return 'gps-atencao';
    return 'gps-falha';
  }

  /**
   * O que fazer com a resposta do servidor ao envio da posição.
   * `parar: true` desliga o GPS — continuar só gastaria bateria.
   */
  function interpretarResposta(r) {
    // Sessão expirada: o sessaoMiddleware manda para o login, e o fetch segue.
    if (r.redirected && /\/login(\?|$)/.test(r.url || '')) {
      return { estado: 'parar', mensagem: 'Sua sessão expirou. Entre de novo para continuar a entrega.' };
    }
    if (r.status === 201) return { estado: 'enviada' };
    if (r.status === 202) return { estado: 'descartada' };
    if (r.status === 409) {
      return { estado: 'parar', mensagem: 'A saída foi encerrada. Recarregue a página.' };
    }
    if (r.status === 403) {
      return { estado: 'parar', mensagem: 'Esta saída não é sua, ou a página expirou. Recarregue a página.' };
    }
    if (r.status === 400) return { estado: 'erro', mensagem: 'O GPS informou uma posição inválida. Nova tentativa em 10 s.' };
    return { estado: 'erro', mensagem: 'Falha ao enviar. Nova tentativa em 10 s.' };
  }

  /**
   * Pode disparar um envio agora?
   * Com a tela bloqueada, o Android congela o timer; ao desbloquear, dispara
   * de uma vez os ciclos acumulados. Sem esta trava, saíam vários envios
   * simultâneos da mesma posição (visto no teste com celular real). Regra: um
   * envio por vez e pelo menos MINIMO_ENTRE_ENVIOS_MS desde a última tentativa.
   * Não depende de o GPS ter lido posição nova: parado num semáforo, o
   * entregador continua mandando a mesma posição, e o cliente vê que está vivo.
   */
  var MINIMO_ENTRE_ENVIOS_MS = 5000;
  function podeEnviar(estado) {
    if (!estado.temPosicao || estado.enviando) return false;
    if (estado.ultimaTentativa === null || estado.ultimaTentativa === undefined) return true;
    return estado.agora - estado.ultimaTentativa >= MINIMO_ENTRE_ENVIOS_MS;
  }

  var api = {
    INTERVALO_ENVIO_MS: INTERVALO_ENVIO_MS,
    MINIMO_ENTRE_ENVIOS_MS: MINIMO_ENTRE_ENVIOS_MS,
    podeEnviar: podeEnviar,
    mensagemErroGeo: mensagemErroGeo,
    descreverIdade: descreverIdade,
    classeIdade: classeIdade,
    interpretarResposta: interpretarResposta,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;   // Node (testes)
    return;
  }

  // ------------------------------------------------------- navegador

  function iniciar() {
    var painel = document.getElementById('painel-gps');
    if (!painel || painel.getAttribute('data-enviar') !== '1') return;

    var faixa  = painel.querySelector('.gps-faixa');
    var aviso  = painel.querySelector('.gps-aviso');
    var tela   = painel.querySelector('.gps-tela');
    var campo  = document.querySelector('form.form-sair input[name="_csrf"]');
    var token  = campo ? campo.value : '';

    var ultima = null;          // última posição lida do GPS
    var ultimoEnvio = null;     // instante do último envio aceito
    var ultimaTentativa = null; // instante do último envio disparado
    var enviando = false;       // há um envio em andamento
    var ativo = true;
    var watchId = null;
    var relogios = [];
    var travaTela = null;

    function mostrarAviso(texto) {
      aviso.textContent = texto || '';
      aviso.hidden = !texto;
    }

    function atualizarFaixa() {
      var idade = ultimoEnvio === null ? null : Date.now() - ultimoEnvio;
      faixa.textContent = '📍 ' + descreverIdade(idade);
      faixa.className = 'gps-faixa ' + classeIdade(idade);
    }

    function parar(mensagem) {
      ativo = false;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      relogios.forEach(clearInterval);
      if (travaTela) travaTela.release().catch(function () {});
      faixa.textContent = '⏹ Envio de localização parado';
      faixa.className = 'gps-faixa gps-falha';
      mostrarAviso(mensagem);
    }

    if (!window.isSecureContext || !('geolocation' in navigator)) {
      faixa.textContent = '⏹ Localização indisponível';
      faixa.className = 'gps-faixa gps-falha';
      mostrarAviso('O GPS só funciona com HTTPS. Abra o sistema pelo endereço seguro.');
      return;
    }

    watchId = navigator.geolocation.watchPosition(
      function (p) {
        ultima = { lat: p.coords.latitude, lng: p.coords.longitude, precisao: p.coords.accuracy };
        if (aviso.textContent.indexOf('GPS') !== -1) mostrarAviso('');
      },
      function (e) {
        mostrarAviso(mensagemErroGeo(e.code));
        if (e.code === 1) parar(mensagemErroGeo(1));   // permissão negada não volta sozinha
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );

    function enviar() {
      if (!ativo) return;
      var agora = Date.now();
      if (!podeEnviar({ temPosicao: Boolean(ultima), enviando: enviando, ultimaTentativa: ultimaTentativa, agora: agora })) return;
      enviando = true;
      ultimaTentativa = agora;
      fetch('/entregas/saida/posicao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
        body: JSON.stringify(ultima),
        credentials: 'same-origin',
      }).then(function (res) {
        var r = interpretarResposta({ status: res.status, redirected: res.redirected, url: res.url });
        if (r.estado === 'enviada' || r.estado === 'descartada') {
          if (r.estado === 'enviada') ultimoEnvio = Date.now();
          if (aviso.textContent.indexOf('Falha') === 0) mostrarAviso('');
        } else if (r.estado === 'parar') {
          parar(r.mensagem);
        } else {
          mostrarAviso(r.mensagem);
        }
        // Depois de parar, a faixa fica no "parado" — redesenhar aqui a
        // devolveria ao verde (defeito pego no navegador).
        if (ativo) atualizarFaixa();
      }).catch(function () {
        mostrarAviso('Falha ao enviar. Nova tentativa em 10 s.');
      }).then(function () {
        enviando = false;
      });
    }

    relogios.push(setInterval(enviar, INTERVALO_ENVIO_MS));
    relogios.push(setInterval(function () { if (ativo) atualizarFaixa(); }, 1000));
    atualizarFaixa();

    // Wake Lock: não existe em todo navegador — degrada sem erro.
    function travar() {
      if (!('wakeLock' in navigator)) {
        tela.hidden = false;
        return;
      }
      navigator.wakeLock.request('screen').then(function (t) {
        travaTela = t;
        tela.hidden = true;
      }).catch(function () { tela.hidden = false; });
    }
    document.addEventListener('visibilitychange', function () {
      // O sistema solta a trava quando a aba some; ao voltar, pede de novo.
      if (ativo && document.visibilityState === 'visible') travar();
    });
    travar();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
