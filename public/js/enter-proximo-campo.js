document.addEventListener('DOMContentLoaded', function () {
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;

    var alvo = e.target;
    var tag  = alvo.tagName;

    // Permite quebra de linha normal em textarea e clique normal em botões/links
    if (tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'A') return;
    if (tag === 'INPUT' && (alvo.type === 'submit' || alvo.type === 'button')) return;

    // Se estiver dentro de um formulário, impede o envio e foca no próximo campo
    var form = alvo.closest('form');
    if (!form) return;

    e.preventDefault();

    var campos = Array.from(form.querySelectorAll('input, select, textarea, button'))
      .filter(function (el) {
        return !el.disabled && el.type !== 'hidden' && el.offsetParent !== null;
      });

    var indiceAtual = campos.indexOf(alvo);
    if (indiceAtual > -1 && indiceAtual < campos.length - 1) {
      campos[indiceAtual + 1].focus();
    }
  });
});