/**
 * Formulário de abertura de OS: ao escolher o cliente, carrega os
 * equipamentos dele no segundo <select>.
 *
 * Arquivo próprio, e não <script> embutido, por causa do CSP (NF007).
 *
 * As opções são montadas com `textContent`, nunca com `innerHTML`: marca,
 * modelo e código são digitados no cadastro de equipamento, e interpolá-los
 * como HTML deixava qualquer marcação cadastrada ali ser interpretada na tela
 * de quem abre a OS.
 */
document.addEventListener('DOMContentLoaded', function () {
  var cliente     = document.getElementById('clienteId');
  var equipamento = document.getElementById('equipamentoId');
  if (!cliente || !equipamento) return;

  function opcao(valor, texto) {
    var o = document.createElement('option');
    o.value       = valor;
    o.textContent = texto;
    return o;
  }

  function trocarOpcoes(opcoes) {
    equipamento.replaceChildren.apply(equipamento, opcoes);
  }

  async function carregarEquipamentos() {
    var clienteId = cliente.value;

    if (!clienteId) {
      trocarOpcoes([opcao('', 'Selecione um cliente primeiro')]);
      return;
    }
    trocarOpcoes([opcao('', 'Carregando...')]);

    try {
      var res  = await fetch('/api/equipamentos/cliente/' + encodeURIComponent(clienteId));
      var data = await res.json();

      if (data.length === 0) {
        trocarOpcoes([opcao('', 'Nenhum equipamento cadastrado para este cliente')]);
        return;
      }
      trocarOpcoes([opcao('', 'Selecione o equipamento')].concat(
        data.map(function (e) {
          return opcao(e.id, e.marca + ' ' + e.modelo + ' — ' + e.codigo);
        })
      ));
    } catch (err) {
      trocarOpcoes([opcao('', 'Erro ao carregar equipamentos')]);
    }
  }

  cliente.addEventListener('change', carregarEquipamentos);
});
