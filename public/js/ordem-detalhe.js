document.addEventListener('DOMContentLoaded', function () {
  var selectProduto = document.getElementById('select-produto-os');
  var inputValor    = document.getElementById('input-valor-unitario');

  if (!selectProduto || !inputValor) return;

  selectProduto.addEventListener('change', function () {
    var opcaoSelecionada = selectProduto.options[selectProduto.selectedIndex];
    if (!opcaoSelecionada) return;

    var preco = opcaoSelecionada.getAttribute('data-preco');

    if (preco) {
      inputValor.value = preco;
    } else {
      inputValor.value = '';
    }
  });
});