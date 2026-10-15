/**
 * Tela de estoque do produto: bloco "gerar conta a pagar" da movimentação.
 *
 * O bloco da conta a pagar só aparece em ENTRADA — não existe conta a pagar
 * de uma baixa por perda. Os campos só ficam obrigatórios quando o usuário
 * marca a caixa.
 *
 * Arquivo próprio, e não <script> embutido, por causa do CSP (NF007).
 */
document.addEventListener('DOMContentLoaded', function () {
  var tipo   = document.querySelector('[name="tipo"]');
  var bloco  = document.getElementById('blocoCompra');
  var caixa  = document.getElementById('gerarContaPagar');
  var campos = document.getElementById('camposCompra');
  if (!tipo || !bloco) return;

  var valor      = document.querySelector('[name="valorCompra"]');
  var vencimento = document.querySelector('[name="vencimentoCompra"]');

  function atualizar() {
    var entrada = tipo.value === 'ENTRADA';
    bloco.style.display = entrada ? 'block' : 'none';
    if (!entrada) caixa.checked = false;

    var marcado = entrada && caixa.checked;
    campos.style.display = marcado ? 'block' : 'none';
    valor.required      = marcado;
    vencimento.required = marcado;
  }

  tipo.addEventListener('change', atualizar);
  caixa.addEventListener('change', atualizar);
  atualizar();
});
