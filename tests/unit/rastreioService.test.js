jest.mock('../../src/config/database', () => ({}));
const r = require('../../src/services/rastreioService');
const rastreioScript = require('../../public/js/rastreio');

/**
 * Módulo 6 — regras puras do acompanhamento da entrega (RN27, RN29, RN31) e
 * do botão "Avisar no WhatsApp". O fluxo com banco está em
 * tests/integration/rastreio.test.js.
 */

describe('número para o WhatsApp', () => {
  test.each([
    [{ celular: '(67) 99264-0369' }, { numero: '5567992640369', fixo: false }],
    [{ celular: '67 98888-1111' }, { numero: '5567988881111', fixo: false }],
    [{ celular: '+55 (67) 99264-0369' }, { numero: '5567992640369', fixo: false }],
    [{ telefone: '(67) 3421-8899' }, { numero: '556734218899', fixo: true }],
    [{ celular: '99264-0369', telefone: '(67) 3421-8899' }, { numero: '556734218899', fixo: true }], // celular sem DDD não serve
    [{ celular: '', telefone: null }, null],
    [{ celular: '123' }, null],
  ])('%j → %j', (cliente, esperado) => {
    expect(r.numeroWhatsApp(cliente)).toEqual(esperado);
  });

  test('o celular tem preferência sobre o fixo', () => {
    expect(r.numeroWhatsApp({ celular: '(67) 99264-0369', telefone: '(67) 3421-8899' }).fixo).toBe(false);
  });
});

describe('link e mensagem do WhatsApp', () => {
  const entrega = {
    ordem: { numero: 'OS-2026-900001', equipamento: { cliente: { nome: 'Padaria Pão Quente', celular: '(67) 99264-0369' } } },
  };

  test('mensagem com nome, OS e link da consulta já com o número', () => {
    const m = r.mensagemWhatsApp({ nomeCliente: 'Ana', numeroOS: 'OS-1', url: 'https://x/consulta?numero=OS-1' });
    expect(m).toMatch(/Olá, Ana!/);
    expect(m).toContain('OS-1');
    expect(m).toContain('https://x/consulta?numero=OS-1');
    expect(m).toMatch(/4 últimos dígitos/);
  });

  test('link wa.me com o número e o texto codificado; barra final da URL é tratada', () => {
    const l = r.linkWhatsApp(entrega, 'https://sga.exemplo.com/');
    expect(l.href.startsWith('https://wa.me/5567992640369?text=')).toBe(true);
    const texto = decodeURIComponent(l.href.split('text=')[1]);
    expect(texto).toContain('https://sga.exemplo.com/consulta?numero=OS-2026-900001');
    expect(l.fixo).toBe(false);
  });

  test('sem telefone utilizável, não há link', () => {
    const sem = { ordem: { ...entrega.ordem, equipamento: { cliente: { nome: 'X' } } } };
    expect(r.linkWhatsApp(sem, 'https://x')).toBeNull();
  });
});

describe('RN27 e RN31 — os 4 dígitos', () => {
  const cliente = { celular: '(67) 99264-0369', telefone: '(67) 3421-8899' };

  test('confere com o fim do celular ou do fixo', () => {
    expect(r.digitosConferem(cliente, '0369')).toBe(true);
    expect(r.digitosConferem(cliente, '8899')).toBe(true);
  });

  test.each(['1234', '036', '03690', '', null, 'abcd'])('%p não confere', (d) => {
    expect(r.digitosConferem(cliente, d)).toBe(false);
  });

  test('sem telefone, nada confere e temTelefone é falso', () => {
    expect(r.digitosConferem({}, '0000')).toBe(false);
    expect(r.temTelefone({ celular: null, telefone: '' })).toBe(false);
    expect(r.temTelefone(cliente)).toBe(true);
  });
});

describe('RN29 — token', () => {
  test('64 hex, aleatório, e o hash é o SHA-256 do token', () => {
    const a = r.gerarToken(); const b = r.gerarToken();
    expect(a.token).toMatch(/^[0-9a-f]{64}$/);
    expect(a.token).not.toBe(b.token);
    expect(a.hash).toBe(require('crypto').createHash('sha256').update(a.token).digest('hex'));
    expect(a.hash).not.toBe(a.token);
  });
});

describe('script do mapa (public/js/rastreio.js)', () => {
  test.each([
    [null, 'Aguardando a primeira localização do entregador…'],
    [9000, 'Localização do entregador atualizada há 9 s'],
    [125000, 'Localização do entregador atualizada há 2 min'],
  ])('%p ms → %s', (ms, texto) => {
    expect(rastreioScript.descreverAtualizacao(ms)).toBe(texto);
  });

  test('200 atualiza; 404 encerra; o resto tenta de novo', () => {
    expect(rastreioScript.interpretar(200)).toBe('atualizar');
    expect(rastreioScript.interpretar(404)).toBe('encerrar');
    expect(rastreioScript.interpretar(500)).toBe('tentar-de-novo');
    expect(rastreioScript.INTERVALO_MS).toBe(10000);
  });
});
