/**
 * Menu recolhível no celular.
 *
 * Arquivo próprio, e não <script> embutido na página, porque o CSP do
 * sistema só autoriza script da própria origem (NF007). Cada script embutido
 * a menos é um passo a menos até poder tirar o 'unsafe-inline' do CSP.
 *
 * Melhoria progressiva: só depois de carregar este arquivo o menu passa a ser
 * recolhível. Se o JavaScript falhar, o CSS mantém o menu aberto — mais
 * comprido, mas ninguém fica sem acesso às telas.
 */
document.addEventListener('DOMContentLoaded', function () {
  var sidebar = document.querySelector('.sidebar');
  var botao   = document.querySelector('.menu-toggle');
  if (!sidebar || !botao) return;

  sidebar.classList.add('menu-recolhivel');

  botao.addEventListener('click', function () {
    var aberto = sidebar.classList.toggle('aberto');
    botao.setAttribute('aria-expanded', aberto ? 'true' : 'false');
    botao.setAttribute('aria-label', aberto ? 'Fechar menu' : 'Abrir menu');
  });
});
