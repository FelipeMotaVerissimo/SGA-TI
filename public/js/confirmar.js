/**
 * Confirmação antes de enviar formulários destrutivos.
 *
 * Substitui os antigos `onsubmit="return confirm(...)"` e
 * `onclick="return confirm(...)"` das views. Basta marcar o formulário:
 *
 *   <form ... data-confirmar="Cancelar esta conta?">
 *
 * Arquivo próprio, e não handler embutido, porque o CSP do sistema não
 * autoriza script embutido (NF007, `script-src 'self'`).
 *
 * O texto vem de um atributo HTML, não de uma string JavaScript: o EJS já o
 * escapa com `<%= %>`, e quebras de linha e apóstrofos no texto (o nome do
 * cliente, por exemplo) não quebram nada. Nos handlers antigos, a mensagem
 * de várias linhas era erro de sintaxe — o navegador descartava o handler e
 * o formulário era enviado sem perguntar.
 *
 * Um único ouvinte no documento cobre todos os formulários da página,
 * inclusive o envio pela tecla Enter.
 */
document.addEventListener('submit', function (evento) {
  var mensagem = evento.target.getAttribute('data-confirmar');
  if (mensagem && !window.confirm(mensagem)) evento.preventDefault();
});
