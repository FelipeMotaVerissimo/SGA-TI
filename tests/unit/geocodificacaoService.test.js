/**
 * Módulo 6 — geocodificação pelo Nominatim.
 * O `fetch` é sempre simulado: nenhum teste toca a rede.
 */

const geo = require('../../src/services/geocodificacaoService');

const CLIENTE = {
  endereco: 'Rua Hayel Bon Faker', numero: '1200', bairro: 'Centro',
  cidade: 'Dourados', estado: 'MS', cep: '79800-000',
};

const resposta = (corpo, ok = true) => ({ ok, json: async () => corpo });

beforeEach(() => geo._reiniciarFila({ intervalo: 1 }));

describe('montarConsulta', () => {
  test('busca estruturada, restrita ao Brasil, com número + rua', () => {
    expect(geo.montarConsulta(CLIENTE)).toEqual({
      format: 'jsonv2', limit: '1', countrycodes: 'br',
      street: '1200 Rua Hayel Bon Faker', city: 'Dourados', state: 'MS',
    });
  });

  test('com a cidade, o CEP fica de fora — a base de CEPs do OSM zera a busca', () => {
    expect(geo.montarConsulta(CLIENTE)).not.toHaveProperty('postalcode');
  });

  test('sem a cidade, o CEP é o que localiza', () => {
    const p = geo.montarConsulta({ endereco: 'Rua A', numero: '10', cep: '79800-000' });
    expect(p.postalcode).toBe('79800-000');
    expect(p).not.toHaveProperty('city');
  });

  test('campos vazios ficam de fora', () => {
    const p = geo.montarConsulta({ endereco: 'Rua A', cidade: 'Dourados', numero: ' ', cep: '' });
    expect(p.street).toBe('Rua A');
    expect(p).not.toHaveProperty('postalcode');
    expect(p).not.toHaveProperty('state');
  });

  test('sem rua, ou sem cidade e sem CEP, não há o que buscar', () => {
    expect(geo.montarConsulta({ ...CLIENTE, endereco: '' })).toBeNull();
    expect(geo.montarConsulta({ endereco: 'Rua A', numero: '10' })).toBeNull();
    expect(geo.montarConsulta(null)).toBeNull();
  });
});

describe('userAgent', () => {
  const original = process.env.NOMINATIM_CONTATO;
  afterEach(() => { process.env.NOMINATIM_CONTATO = original; });

  test('identifica o app; o contato vem da variável, quando existe', () => {
    delete process.env.NOMINATIM_CONTATO;
    expect(geo.userAgent()).toBe('SGA-TI/1.0 (TCC UNIGRAN)');
    process.env.NOMINATIM_CONTATO = 'contato@exemplo.com';
    expect(geo.userAgent()).toBe('SGA-TI/1.0 (TCC UNIGRAN; contato@exemplo.com)');
  });
});

describe('consultar', () => {
  test('sucesso: devolve lat/lng numéricos e manda User-Agent e timeout', async () => {
    const f = jest.fn().mockResolvedValue(resposta([{ lat: '-22.2211', lon: '-54.8056' }]));
    const r = await geo.consultar(geo.montarConsulta(CLIENTE), f);

    expect(r).toEqual({ lat: -22.2211, lng: -54.8056 });
    const [url, opcoes] = f.mock.calls[0];
    expect(url.startsWith(geo.URL_NOMINATIM + '?')).toBe(true);
    expect(url).toContain('countrycodes=br');
    expect(opcoes.headers['User-Agent']).toMatch(/^SGA-TI\//);
    expect(opcoes.signal).toBeDefined();
  });

  test.each([
    ['sem resultado', resposta([])],
    ['erro HTTP', resposta([], false)],
    ['coordenada inválida', resposta([{ lat: 'x', lon: '1' }])],
    ['corpo que não é lista', resposta({ erro: 'x' })],
  ])('%s → null', async (_, r) => {
    expect(await geo.consultar({ street: 'x' }, jest.fn().mockResolvedValue(r))).toBeNull();
  });

  test('timeout ou rede fora → null, sem lançar', async () => {
    const timeout = Object.assign(new Error('timeout'), { name: 'TimeoutError' });
    expect(await geo.consultar({ street: 'x' }, jest.fn().mockRejectedValue(timeout))).toBeNull();
  });
});

describe('geocodificar (fila)', () => {
  test('sem endereço suficiente nem chama o Nominatim', async () => {
    const f = jest.fn();
    expect(await geo.geocodificar({ cidade: 'Dourados' }, { fetchImpl: f })).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  test('chamadas seguidas respeitam o intervalo mínimo entre si', async () => {
    geo._reiniciarFila({ intervalo: 60 });
    const instantes = [];
    const f = jest.fn(async () => { instantes.push(Date.now()); return resposta([{ lat: '1', lon: '2' }]); });

    await Promise.all([1, 2, 3].map(() => geo.geocodificar(CLIENTE, { fetchImpl: f })));

    expect(f).toHaveBeenCalledTimes(3);
    expect(instantes[1] - instantes[0]).toBeGreaterThanOrEqual(55);
    expect(instantes[2] - instantes[1]).toBeGreaterThanOrEqual(55);
  });

  test('em produção o intervalo é o da política: 1 s', () => {
    expect(geo.INTERVALO_MS).toBe(1000);
    expect(geo.TIMEOUT_MS).toBe(5000);
  });
});
