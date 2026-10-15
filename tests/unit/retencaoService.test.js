jest.mock('../../src/config/database', () => ({}));
jest.mock('../../src/services/auditoriaExtensao', () => ({ aguardarGravacoes: jest.fn() }));

const retencao = require('../../src/services/retencaoService');

/**
 * NF008 — as funções que procuram o dado pessoal dentro de texto livre.
 *
 * São a parte mais fácil de errar: substituir de menos deixa o dado vazar;
 * substituir demais apaga texto que não tinha nada a ver com o titular.
 */

const { NOME_ANONIMO, MARCA_NO_LOG } = retencao;

describe('paresDeSubstituicao', () => {
  test('o nome vira "Cliente anonimizado"; os demais, a marca', () => {
    const pares = retencao.paresDeSubstituicao({ nome: 'Joana Ribeiro Silva', email: 'joana@x.com' });

    expect(pares).toContainEqual(['Joana Ribeiro Silva', NOME_ANONIMO]);
    expect(pares).toContainEqual(['joana@x.com', MARCA_NO_LOG]);
  });

  test('ordena do mais longo para o mais curto', () => {
    // Senão um pedaço seria trocado antes do valor inteiro, e o resto sobraria.
    const pares = retencao.paresDeSubstituicao({ nome: 'Ana Maria Souza', rg: '1234567' });
    expect(pares[0][0]).toBe('Ana Maria Souza');
  });

  test('valor curto demais não entra — evita apagar texto sem relação', () => {
    const pares = retencao.paresDeSubstituicao({ nome: 'Ana', cep: '123' });
    expect(pares).toEqual([]);
  });

  test('número da casa e data de nascimento ficam de fora de propósito', () => {
    const pares = retencao.paresDeSubstituicao({ numero: '1234', dataNascimento: '1990-05-10' });
    expect(pares).toEqual([]);
  });

  test('valor já anonimizado não é procurado de novo', () => {
    const pares = retencao.paresDeSubstituicao({ nome: NOME_ANONIMO, cpfCnpj: 'ANON-12' });
    expect(pares).toEqual([]);
  });

  test('sem dados originais, nada a procurar', () => {
    expect(retencao.paresDeSubstituicao({})).toEqual([]);
    expect(retencao.paresDeSubstituicao(undefined)).toEqual([]);
  });
});

describe('substituirEmTexto', () => {
  test('troca todas as ocorrências, não só a primeira', () => {
    const pares = [['Joana Silva', NOME_ANONIMO]];
    expect(retencao.substituirEmTexto('Joana Silva e Joana Silva', pares))
      .toBe(`${NOME_ANONIMO} e ${NOME_ANONIMO}`);
  });

  test('telefone com parênteses e hífen é encontrado — sem regex', () => {
    // Usado como regex, "(67) 99911-2233" teria ( ) e - interpretados.
    const pares = [['(67) 99911-2233', MARCA_NO_LOG]];
    expect(retencao.substituirEmTexto('ligar no (67) 99911-2233', pares))
      .toBe(`ligar no ${MARCA_NO_LOG}`);
  });

  test('texto vazio ou não-texto passa intacto', () => {
    const pares = [['Joana', NOME_ANONIMO]];
    expect(retencao.substituirEmTexto('', pares)).toBe('');
    expect(retencao.substituirEmTexto(null, pares)).toBeNull();
    expect(retencao.substituirEmTexto(42, pares)).toBe(42);
  });
});

describe('normalizarDescricaoGerada', () => {
  test('tira o nome da descrição do faturamento, mesmo sem saber qual era', () => {
    expect(retencao.normalizarDescricaoGerada('OS OS-2026-000108 — Joana Ribeiro Silva'))
      .toBe(`OS OS-2026-000108 — ${NOME_ANONIMO}`);
  });

  test('descrição que não segue o formato do faturamento não é tocada', () => {
    const manual = 'Contrato de manutenção mensal — agosto';
    expect(retencao.normalizarDescricaoGerada(manual)).toBe(manual);
  });

  test('descrição já normalizada continua igual — idempotente', () => {
    const pronta = `OS OS-2026-000108 — ${NOME_ANONIMO}`;
    expect(retencao.normalizarDescricaoGerada(pronta)).toBe(pronta);
  });
});
