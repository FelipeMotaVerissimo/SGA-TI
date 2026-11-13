document.addEventListener('DOMContentLoaded', function () {
  // 1. Cálculo automático: Valor Unitário x Quantidade e Parcelas (Contas a Pagar)
  const inputUnit     = document.getElementById('pagar-valor-unitario');
  const inputQtd      = document.getElementById('pagar-quantidade');
  const inputParcelas = document.getElementById('pagar-parcelas');
  const inputTotal    = document.getElementById('pagar-valor-total');
  const infoParcela   = document.getElementById('pagar-resumo-parcela');

  function recalcularPagar() {
    if (!inputTotal) return;
    const unit = Number(String(inputUnit?.value || 0).replace(',', '.'));
    const qtd  = Math.max(1, parseInt(inputQtd?.value || 1, 10));
    const parc = Math.max(1, parseInt(inputParcelas?.value || 1, 10));

    if (unit > 0) {
      inputTotal.value = (unit * qtd).toFixed(2).replace('.', ',');
    }

    const total = Number(String(inputTotal.value || 0).replace(',', '.'));
    if (infoParcela) {
      if (total > 0 && parc > 1) {
        infoParcela.textContent = `Serão geradas ${parc} parcelas mensais de R$ ${(total / parc).toFixed(2)}`;
      } else if (unit > 0 && qtd > 1) {
        infoParcela.textContent = `${qtd} unidades × R$ ${unit.toFixed(2)} = R$ ${total.toFixed(2)}`;
      } else {
        infoParcela.textContent = '';
      }
    }
  }

  [inputUnit, inputQtd, inputParcelas, inputTotal].forEach((el) => {
    if (el) el.addEventListener('input', recalcularPagar);
  });

  // 2. Modal de Método de Pagamento ao Receber (Contas a Receber)
  const modal          = document.getElementById('modal-forma-pagamento');
  const formModal      = document.getElementById('form-quitar-receber');
  const descModal      = document.getElementById('modal-conta-descricao');
  const btnFechar      = document.getElementById('btn-fechar-modal-pagamento');
  const selectForma    = document.getElementById('select-forma-pagamento');
  const grupoParcelas  = document.getElementById('grupo-parcelas-credito');
  const selectParcelas = document.getElementById('select-parcelas-credito');

  function atualizarVisibilidadeParcelas() {
    if (!selectForma || !grupoParcelas) return;
    if (selectForma.value === 'Cartão de Crédito') {
      grupoParcelas.style.display = 'block';
    } else {
      grupoParcelas.style.display = 'none';
      if (selectParcelas) selectParcelas.value = '1';
    }
  }

  if (selectForma) {
    selectForma.addEventListener('change', atualizarVisibilidadeParcelas);
  }

  document.querySelectorAll('.btn-abrir-receber').forEach((btn) => {
    btn.addEventListener('click', function () {
      if (!modal || !formModal) return;
      formModal.action = this.getAttribute('data-action');
      if (descModal) {
        descModal.textContent = this.getAttribute('data-descricao') || '';
      }
      if (selectForma) selectForma.value = '';
      atualizarVisibilidadeParcelas();
      modal.style.display = 'flex';
    });
  });

  if (btnFechar && modal) {
    btnFechar.addEventListener('click', function () {
      modal.style.display = 'none';
    });
  }
});