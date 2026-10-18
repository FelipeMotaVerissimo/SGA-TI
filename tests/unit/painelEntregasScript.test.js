/**
 * Módulo 6 — regras do script do painel de entregas (public/js/painel-entregas.js).
 *
 * Como no script do entregador, só as funções puras rodam aqui no Node; o
 * mapa e o fetch são conferidos no navegador.
 */

const p = require('../../public/js/painel-entregas');

describe('linha de status do mapa', () => {
  test('sem posição, diz que o entregador ainda não enviou', () => {
    expect(p.descreverAtualizacao(null)).toMatch(/ainda não enviou/);
  });

  test('em segundos abaixo de 1 min, em minutos depois', () => {
    expect(p.descreverAtualizacao(12500)).toBe('Localização do entregador há 12 s');
    expect(p.descreverAtualizacao(59999)).toBe('Localização do entregador há 59 s');
    expect(p.descreverAtualizacao(125000)).toBe('Localização do entregador há 2 min');
  });

  test('relógio adiantado do servidor não dá tempo negativo', () => {
    expect(p.descreverAtualizacao(-3000)).toBe('Localização do entregador há 0 s');
  });
});

describe('resposta da atualização', () => {
  test('200 atualiza, 404 encerra, o resto tenta de novo', () => {
    expect(p.interpretar(200)).toBe('atualizar');
    expect(p.interpretar(404)).toBe('encerrar');
    expect(p.interpretar(500)).toBe('tentar-de-novo');
    expect(p.interpretar(302)).toBe('tentar-de-novo');
  });

  test('sessão expirada: o fetch chega à tela de login com 200, mas redirecionado', () => {
    expect(p.interpretar(200, true)).toBe('sessao-expirada');
    expect(p.interpretar(200, false)).toBe('atualizar');
  });
});

describe('cor do pino', () => {
  test('segue o status da parada', () => {
    expect(p.classePino('ENTREGUE')).toBe('pino-parada pino-ENTREGUE');
    expect(p.classePino('NAO_ENTREGUE')).toBe('pino-parada pino-NAO_ENTREGUE');
  });

  test('status desconhecido não vira classe arbitrária', () => {
    expect(p.classePino('"><img')).toBe('pino-parada pino-PENDENTE');
    expect(p.classePino(undefined)).toBe('pino-parada pino-PENDENTE');
  });
});

test('atualiza a cada 10 s, como o rastreio do cliente', () => {
  expect(p.INTERVALO_MS).toBe(10000);
});
