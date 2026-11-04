document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('modal-desbloqueio');
  const btnAbrir = document.getElementById('btn-solicitar-desbloqueio');
  const btnCancelar = document.getElementById('btn-cancelar-desbloqueio');
  const formDesbloqueio = document.getElementById('form-desbloqueio');
  const erroMsg = document.getElementById('erro-desbloqueio');
  const btnConfirmar = document.getElementById('btn-confirmar-desbloqueio');
  const inputSenha = document.getElementById('senha-desbloqueio');

  if (btnAbrir) {
    btnAbrir.addEventListener('click', () => {
      if (erroMsg) erroMsg.style.display = 'none';
      if (inputSenha) inputSenha.value = '';
      if (modal) {
        modal.style.display = 'block';
        if (inputSenha) setTimeout(() => inputSenha.focus(), 100);
      }
    });
  }

  if (btnCancelar) {
    btnCancelar.addEventListener('click', () => {
      if (modal) modal.style.display = 'none';
    });
  }

  if (formDesbloqueio) {
    formDesbloqueio.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (erroMsg) erroMsg.style.display = 'none';

      if (btnConfirmar) {
        btnConfirmar.disabled = true;
        btnConfirmar.textContent = 'A validar...';
      }

      const senha = inputSenha ? inputSenha.value : '';
      const csrfEl = document.querySelector('input[name="_csrf"]');
      const csrfToken = csrfEl ? csrfEl.value : '';

      try {
        const res = await fetch('/auth/validar-senha-atual', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken
          },
          body: JSON.stringify({ senha, _csrf: csrfToken })
        });

        const data = await res.json();

        if (res.ok && data.valida) {
          // Desbloqueia os campos do formulário
          const formOS = document.querySelector('form[action^="/ordens/"][action$="/status"]');
          if (formOS) {
            const elementosBloqueados = formOS.querySelectorAll('select, input, textarea, button');
            elementosBloqueados.forEach(el => {
              el.disabled = false;
            });
          }

          if (btnAbrir) btnAbrir.style.display = 'none';
          if (modal) modal.style.display = 'none';
        } else {
          if (erroMsg) {
            erroMsg.textContent = data.mensagem || 'Senha incorreta. Tente novamente.';
            erroMsg.style.display = 'block';
          }
        }
      } catch (err) {
        if (erroMsg) {
          erroMsg.textContent = 'Erro ao validar senha com o servidor.';
          erroMsg.style.display = 'block';
        }
      } finally {
        if (btnConfirmar) {
          btnConfirmar.disabled = false;
          btnConfirmar.textContent = 'Confirmar';
        }
      }
    });
  }
});