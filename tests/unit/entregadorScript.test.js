/**
 * Módulo 6 — regras do script do entregador (public/js/entregador.js).
 *
 * O script roda no navegador do celular; a parte que decide o que mostrar e
 * quando parar fica em funções puras, exportadas para rodar aqui no Node — o
 * projeto não tem jsdom, e não vale uma dependência só para isto. O resto
 * (GPS, fetch, Wake Lock) é conferido no navegador.
 */

const e = require('../../public/js/entregador');

describe('mensagens de erro do GPS', () => {
  test('permissão negada orienta a liberar nas configurações', () => {
    expect(e.mensagemErroGeo(1)).toMatch(/Permita a localização/);
  });

  test('sem sinal e tempo esgotado avisam que está procurando', () => {
    expect(e.mensagemErroGeo(2)).toMatch(/Procurando sinal/);
    expect(e.mensagemErroGeo(3)).toMatch(/Procurando sinal/);
  });

  test('código desconhecido tem mensagem genérica', () => {
    expect(e.mensagemErroGeo(99)).toMatch(/Não foi possível/);
  });
});

describe('há quanto tempo foi o último envio', () => {
  test.each([
    [null, 'Localização ainda não enviada'],
    [0, 'Localização enviada há 0 s'],
    [8400, 'Localização enviada há 8 s'],
    [59999, 'Localização enviada há 59 s'],
    [60000, 'Localização enviada há 1 min'],
    [185000, 'Localização enviada há 3 min'],
  ])('%p ms → %s', (ms, texto) => {
    expect(e.descreverIdade(ms)).toBe(texto);
  });

  test.each([
    [null, 'gps-atencao'],
    [5000, 'gps-ok'],
    [20000, 'gps-ok'],        // até dois ciclos de 10 s é normal
    [20001, 'gps-atencao'],
    [60000, 'gps-atencao'],
    [60001, 'gps-falha'],
  ])('cor da faixa com %p ms → %s', (ms, classe) => {
    expect(e.classeIdade(ms)).toBe(classe);
  });

  test('o envio é a cada 10 s, como no prompt do módulo', () => {
    expect(e.INTERVALO_ENVIO_MS).toBe(10000);
  });
});

describe('reação à resposta do servidor', () => {
  test('201 enviada; 202 descartada pelo intervalo — os dois seguem', () => {
    expect(e.interpretarResposta({ status: 201 })).toEqual({ estado: 'enviada' });
    expect(e.interpretarResposta({ status: 202 })).toEqual({ estado: 'descartada' });
  });

  test('409: a saída acabou — para o GPS', () => {
    expect(e.interpretarResposta({ status: 409 })).toMatchObject({ estado: 'parar', mensagem: expect.stringMatching(/encerrada/) });
  });

  test('403: saída de outro ou página expirada — para o GPS', () => {
    expect(e.interpretarResposta({ status: 403 }).estado).toBe('parar');
  });

  test('sessão expirada: o fetch seguiu o redirect para o login — para o GPS', () => {
    const r = e.interpretarResposta({ status: 200, redirected: true, url: 'https://x.com/login' });
    expect(r).toMatchObject({ estado: 'parar', mensagem: expect.stringMatching(/sessão expirou/) });
  });

  test('400 e erros do servidor: avisa e tenta de novo no próximo ciclo', () => {
    expect(e.interpretarResposta({ status: 400 })).toMatchObject({ estado: 'erro' });
    expect(e.interpretarResposta({ status: 500 })).toMatchObject({ estado: 'erro', mensagem: expect.stringMatching(/Nova tentativa/) });
  });

  test('redirecionamento que não é para o login não é confundido com sessão expirada', () => {
    expect(e.interpretarResposta({ status: 201, redirected: true, url: 'https://x.com/loginfo' })).toEqual({ estado: 'enviada' });
  });
});

describe('trava contra rajada de envios', () => {
  const base = { temPosicao: true, enviando: false, ultimaTentativa: null, agora: 100000 };

  test('primeiro envio, com posição: pode', () => {
    expect(e.podeEnviar(base)).toBe(true);
  });

  test('sem posição do GPS ainda: não', () => {
    expect(e.podeEnviar({ ...base, temPosicao: false })).toBe(false);
  });

  test('com um envio em andamento: não — é o que barra a rajada', () => {
    expect(e.podeEnviar({ ...base, enviando: true })).toBe(false);
  });

  test('menos de 5 s desde a última tentativa: não; 5 s ou mais: pode', () => {
    expect(e.podeEnviar({ ...base, ultimaTentativa: 100000 - 4999 })).toBe(false);
    expect(e.podeEnviar({ ...base, ultimaTentativa: 100000 - 5000 })).toBe(true);
    expect(e.MINIMO_ENTRE_ENVIOS_MS).toBe(5000);
  });
});
