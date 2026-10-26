document.addEventListener('DOMContentLoaded', () => {
  // Elementos do Cliente
  const modalCliente = document.getElementById('modal-novo-cliente');
  const btnAbrirCliente = document.getElementById('btn-abrir-modal-cliente');
  const btnCancelarCliente = document.getElementById('btn-cancelar-modal-cliente');
  const formCliente = document.getElementById('form-modal-cliente');
  const erroCliente = document.getElementById('erro-modal-cliente');
  const selectCliente = document.getElementById('clienteId');

  // Elementos do Equipamento
  const modalEquip = document.getElementById('modal-novo-equipamento');
  const btnAbrirEquip = document.getElementById('btn-abrir-modal-equipamento');
  const btnCancelarEquip = document.getElementById('btn-cancelar-modal-equipamento');
  const formEquip = document.getElementById('form-modal-equipamento');
  const erroEquip = document.getElementById('erro-modal-equipamento');
  const selectEquip = document.getElementById('equipamentoId');

  // --- CLIENTE ---
  if (btnAbrirCliente) {
    btnAbrirCliente.addEventListener('click', () => {
      if (erroCliente) erroCliente.style.display = 'none';
      if (formCliente) formCliente.reset();
      if (modalCliente) {
        modalCliente.style.display = 'block';
        const inputNome = document.getElementById('modal-cliente-nome');
        if (inputNome) setTimeout(() => inputNome.focus(), 150);
      }
    });
  }

  if (btnCancelarCliente) {
    btnCancelarCliente.addEventListener('click', () => {
      if (modalCliente) modalCliente.style.display = 'none';
    });
  }

  if (formCliente) {
    formCliente.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (erroCliente) erroCliente.style.display = 'none';

      const btnSalvar = document.getElementById('btn-salvar-modal-cliente');
      if (btnSalvar) {
        btnSalvar.disabled = true;
        btnSalvar.textContent = 'A guardar...';
      }

      const formData = new FormData(formCliente);
      const payload = Object.fromEntries(formData.entries());

      try {
        const csrfEl = document.querySelector('input[name="_csrf"]');
        const csrfToken = csrfEl ? csrfEl.value : '';

        const res = await fetch('/clientes/rapido', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken
          },
          body: JSON.stringify({ ...payload, _csrf: csrfToken })
        });

        const contentType = res.headers.get('content-type');
        let data;
        if (contentType && contentType.includes('application/json')) {
          data = await res.json();
        } else {
          const textoHtml = await res.text();
          console.error('Resposta do servidor não foi JSON (Cliente):', textoHtml);
          throw new Error(`O servidor respondeu com status ${res.status} (${res.statusText})`);
        }

        if (res.ok && data.sucesso && data.cliente) {
          const opt = document.createElement('option');
          opt.value = data.cliente.id;
          opt.textContent = `${data.cliente.nome}${data.cliente.cpfCnpj ? ' — ' + data.cliente.cpfCnpj : ''}`;
          opt.selected = true;
          selectCliente.appendChild(opt);

          selectCliente.dispatchEvent(new Event('change'));

          if (modalCliente) modalCliente.style.display = 'none';
        } else {
          if (erroCliente) {
            erroCliente.textContent = data.mensagem || 'Erro ao registar cliente.';
            erroCliente.style.display = 'block';
          }
        }
      } catch (err) {
        console.error('Falha na requisição (Cliente):', err);
        if (erroCliente) {
          erroCliente.textContent = 'Erro ao contactar o servidor: ' + err.message;
          erroCliente.style.display = 'block';
        }
      } finally {
        if (btnSalvar) {
          btnSalvar.disabled = false;
          btnSalvar.textContent = 'Salvar Cliente';
        }
      }
    });
  }

  // --- EQUIPAMENTO ---
  if (btnAbrirEquip) {
    btnAbrirEquip.addEventListener('click', () => {
      const clienteId = selectCliente?.value;
      if (!clienteId) {
        alert('Selecione um cliente primeiro antes de adicionar um equipamento!');
        selectCliente.focus();
        return;
      }

      if (erroEquip) erroEquip.style.display = 'none';
      if (formEquip) formEquip.reset();
      if (modalEquip) {
        modalEquip.style.display = 'block';
        const inputMarca = document.getElementById('modal-equip-marca');
        if (inputMarca) setTimeout(() => inputMarca.focus(), 150);
      }
    });
  }

  if (btnCancelarEquip) {
    btnCancelarEquip.addEventListener('click', () => {
      if (modalEquip) modalEquip.style.display = 'none';
    });
  }

  if (formEquip) {
    formEquip.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (erroEquip) erroEquip.style.display = 'none';

      const clienteId = selectCliente ? selectCliente.value : '';
      if (!clienteId) {
        if (erroEquip) {
          erroEquip.textContent = 'Selecione um cliente no formulário da OS primeiro.';
          erroEquip.style.display = 'block';
        }
        return;
      }

      const btnSalvar = document.getElementById('btn-salvar-modal-equip');
      if (btnSalvar) {
        btnSalvar.disabled = true;
        btnSalvar.textContent = 'A guardar...';
      }

      const formData = new FormData(formEquip);
      const payload = Object.fromEntries(formData.entries());
      payload.clienteId = clienteId;

      try {
        const csrfToken = document.querySelector('input[name="_csrf"]')?.value || '';
        const res = await fetch('/equipamentos/rapido', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json', 
            'X-CSRF-Token': csrfToken 
          },
          body: JSON.stringify({ ...payload, _csrf: csrfToken })
        });

        const contentType = res.headers.get('content-type');
        let data;
        if (contentType && contentType.includes('application/json')) {
          data = await res.json();
        } else {
          const textoHtml = await res.text();
          console.error('Resposta do servidor não foi JSON (Equipamento):', textoHtml);
          throw new Error(`A rota retornou status ${res.status} (${res.statusText})`);
        }

        if (res.ok && data.sucesso && data.equipamento) {
          const opt = document.createElement('option');
          opt.value = data.equipamento.id;
          opt.textContent = `${data.equipamento.marca} ${data.equipamento.modelo} (${data.equipamento.codigo})`;
          opt.selected = true;

          // Limpa opções antigas sem usar innerHTML
          if (selectEquip.options.length <= 1) {
            selectEquip.textContent = '';
          }
          selectEquip.appendChild(opt);
          selectEquip.disabled = false;

          const campoObs = document.querySelector('textarea[name="observacoes"]');
          if (campoObs && data.detalhesExtras) {
            const extras = [];
            if (data.detalhesExtras.condicoesEntrada) extras.push(`Condições: ${data.detalhesExtras.condicoesEntrada}`);
            if (data.detalhesExtras.acessorios) extras.push(`Acessórios: ${data.detalhesExtras.acessorios}`);
            if (extras.length > 0) {
              campoObs.value = (campoObs.value ? campoObs.value + '\n' : '') + extras.join(' | ');
            }
          }

          if (modalEquip) modalEquip.style.display = 'none';
        } else {
          if (erroEquip) {
            erroEquip.textContent = data.mensagem || 'Erro ao registar equipamento.';
            erroEquip.style.display = 'block';
          }
        }
      } catch (err) {
        console.error('Erro ao guardar equipamento:', err);
        if (erroEquip) {
          erroEquip.textContent = 'Erro ao contactar o servidor: ' + err.message;
          erroEquip.style.display = 'block';
        }
      } finally {
        if (btnSalvar) {
          btnSalvar.disabled = false;
          btnSalvar.textContent = 'Salvar Equipamento';
        }
      }
    });
  }
});