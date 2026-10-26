document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('modal-autorizacao-senha');
  const input = document.getElementById('input-senha-confirmacao');
  const erro = document.getElementById('erro-modal-senha');
  const btnAbrir = document.getElementById('btn-abrir-desbloqueio');
  const btnCancelar = document.getElementById('btn-cancelar-desbloqueio');
  const btnConfirmar = document.getElementById('btn-confirmar-desbloqueio');

  function abrirModal() {
    if (erro) erro.style.display = 'none';
    if (input) input.value = '';
    if (modal) {
      modal.style.display = 'block';
      setTimeout(() => input.focus(), 150);
    }
  }

  function fecharModal() {
    if (modal) modal.style.display = 'none';
  }

  async function confirmarDesbloqueio() {
    const senha = input ? input.value : '';

    if (!senha) {
      if (erro) {
        erro.innerText = 'Por favor, introduza a sua senha.';
        erro.style.display = 'block';
      }
      if (input) input.focus();
      return;
    }

    if (btnConfirmar) {
      btnConfirmar.disabled = true;
      btnConfirmar.innerText = 'A validar...';
    }

    try {
      const csrfEl = document.querySelector('input[name="_csrf"]');
      const csrfToken = csrfEl ? csrfEl.value : '';

      const res = await fetch('/auth/validar-senha-atual', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken
        },
        body: JSON.stringify({ senha: senha, _csrf: csrfToken })
      });

      const data = await res.json();

      if (res.ok && data.sucesso) {
        // 1. Remove o atributo disabled de todos os formulários e campos
        const fieldset = document.getElementById('grupo-campos-os');
        if (fieldset) fieldset.removeAttribute('disabled');

        const selectStatus = document.getElementById('select-status-os');
        if (selectStatus) selectStatus.removeAttribute('disabled');

        const botoes = document.querySelectorAll('.botao-bloqueavel');
        botoes.forEach(b => b.removeAttribute('disabled'));

        // 2. Atualiza o aviso de estado no topo da página
        const banner = document.getElementById('banner-bloqueio-os');
        if (banner) {
          banner.style.background = '#fffaf0';
          banner.style.borderLeftColor = '#fbd38d';
          banner.innerHTML = '<strong style="color:#975a16">🔓 Edição Desbloqueada:</strong> <span style="color:#555; font-size:13px; margin-left:6px">Confirmou a sua senha. Os campos encontram-se agora abertos para edição.</span>';
        }

        fecharModal();
      } else {
        if (erro) {
          erro.innerText = data.mensagem || 'Senha incorreta.';
          erro.style.display = 'block';
        }
        if (input) input.focus();
      }
    } catch (err) {
      if (erro) {
        erro.innerText = 'Erro ao contactar o servidor.';
        erro.style.display = 'block';
      }
    } finally {
      if (btnConfirmar) {
        btnConfirmar.disabled = false;
        btnConfirmar.innerText = 'Confirmar Senha';
      }
    }
  }

  // Atribui os eventos via JavaScript, sem atributos onclick inline
  if (btnAbrir) {
    btnAbrir.addEventListener('click', abrirModal);
  }

  if (btnCancelar) {
    btnCancelar.addEventListener('click', fecharModal);
  }

  if (btnConfirmar) {
    btnConfirmar.addEventListener('click', confirmarDesbloqueio);
  }

  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        confirmarDesbloqueio();
      }
    });
  }
});