/*
 * Desbloqueio de OS concluída com a senha do usuário logado (views/ordens/detalhe.ejs).
 *
 * Os ids abaixo precisam existir na tela: tests/integration/desbloqueioOs.test.js
 * confere isso. Em 25/10/2026 o script foi reescrito com outros nomes e o botão
 * parou de responder sem nenhum erro visível.
 *
 * Só textContent e criação de elementos: nada de innerHTML (CSP e XSS).
 */
document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('modal-autorizacao-senha');
  const input = document.getElementById('input-senha-confirmacao');
  const erro = document.getElementById('erro-modal-senha');
  const btnAbrir = document.getElementById('btn-abrir-desbloqueio');
  const btnCancelar = document.getElementById('btn-cancelar-desbloqueio');
  const btnConfirmar = document.getElementById('btn-confirmar-desbloqueio');

  function mostrarErro(texto) {
    if (!erro) return;
    erro.textContent = texto;
    erro.style.display = 'block';
  }

  function abrirModal() {
    if (erro) erro.style.display = 'none';
    if (input) input.value = '';
    if (modal) {
      modal.style.display = 'block';
      if (input) setTimeout(() => input.focus(), 150);
    }
  }

  function fecharModal() {
    if (modal) modal.style.display = 'none';
  }

  function liberarCampos() {
    const fieldset = document.getElementById('grupo-campos-os');
    if (fieldset) fieldset.removeAttribute('disabled');

    const selectStatus = document.getElementById('select-status-os');
    if (selectStatus) selectStatus.removeAttribute('disabled');

    document.querySelectorAll('.botao-bloqueavel').forEach((b) => b.removeAttribute('disabled'));

    const banner = document.getElementById('banner-bloqueio-os');
    if (banner) {
      banner.style.background = '#fffaf0';
      banner.style.borderLeftColor = '#fbd38d';
      const titulo = document.createElement('strong');
      titulo.style.color = '#975a16';
      titulo.textContent = '🔓 Edição desbloqueada.';
      const texto = document.createElement('span');
      texto.style.color = '#555';
      texto.style.fontSize = '13px';
      texto.style.marginLeft = '6px';
      texto.textContent = 'Senha confirmada: os campos estão abertos para edição.';
      banner.replaceChildren(titulo, texto);
    }
  }

  async function confirmarDesbloqueio() {
    const senha = input ? input.value : '';
    if (!senha) {
      mostrarErro('Informe a sua senha.');
      if (input) input.focus();
      return;
    }

    if (btnConfirmar) {
      btnConfirmar.disabled = true;
      btnConfirmar.textContent = 'Validando...';
    }

    try {
      const csrfEl = document.querySelector('input[name="_csrf"]');
      const csrfToken = csrfEl ? csrfEl.value : '';

      const res = await fetch('/auth/validar-senha-atual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ senha }),
      });
      const data = await res.json();

      // O servidor responde { sucesso, mensagem } (authWebController.validarSenhaUsuarioLogado).
      if (res.ok && data.sucesso) {
        liberarCampos();
        fecharModal();
      } else {
        mostrarErro(data.mensagem || 'Senha incorreta.');
        if (input) input.focus();
      }
    } catch (err) {
      mostrarErro('Erro ao contatar o servidor.');
    } finally {
      if (btnConfirmar) {
        btnConfirmar.disabled = false;
        btnConfirmar.textContent = 'Confirmar Senha';
      }
    }
  }

  if (btnAbrir) btnAbrir.addEventListener('click', abrirModal);
  if (btnCancelar) btnCancelar.addEventListener('click', fecharModal);
  if (btnConfirmar) btnConfirmar.addEventListener('click', confirmarDesbloqueio);
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') confirmarDesbloqueio();
    });
  }
});
