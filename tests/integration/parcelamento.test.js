require('../helpers/ambiente'); // precisa vir antes de src/app

const request = require('supertest');
const app     = require('../../src/app');
const { semear, logar, prisma } = require('../helpers/fixture');

/**
 * Parcelamento de conta a pagar — valores no limite (bateria da 6ª Etapa, 13/11/2026).
 *
 * Defeitos achados:
 *  1. Valor pequeno em muitas parcelas gerava parcela zerada ou negativa
 *     (R$ 0,20 em 24x → 1ª parcela de -R$ 0,03; R$ 0,01 em 2x → R$ 0,00).
 *  2. "parcelas" com texto não gravava nada, mas a tela dizia "sucesso".
 */

let agente;

beforeAll(async () => {
  await semear();
  agente = await logar(request, app, 'financeiro');
});
afterAll(async () => { await prisma.$disconnect(); });

async function lancar(descricao, campos) {
  const r = await agente.post('/financeiro/pagar').type('form')
    .send({ descricao, vencimento: '2026-12-01', ...campos });
  const contas = await prisma.contaPagar.findMany({
    where: { descricao: { startsWith: descricao } }, orderBy: { id: 'asc' },
  });
  return { r, contas, valores: contas.map((c) => Number(c.valor)) };
}

const soma = (vs) => Math.round(vs.reduce((a, v) => a + v * 100, 0)) / 100;

describe('parcelas sempre positivas e somando o total', () => {
  test.each([
    ['0,24', 24], ['0,25', 24], ['0,36', 24], ['0,60', 60], ['0,02', 2],
    ['100,00', 3], ['100,00', 6], ['1000,00', 7], ['9999999,99', 60],
  ])('R$ %s em %ix', async (valor, parcelas) => {
    const desc = `Parc ${valor} ${parcelas}x`;
    const { r, contas, valores } = await lancar(desc, { valor, parcelas: String(parcelas) });

    expect(r.status).toBe(302);
    expect(contas).toHaveLength(parcelas);
    expect(Math.min(...valores)).toBeGreaterThanOrEqual(0.01);
    expect(soma(valores)).toBe(Number(valor.replace(',', '.')));
    // A sobra de centavos fica só na 1ª; as demais são iguais entre si.
    expect(new Set(valores.slice(1)).size).toBe(1);
  });

  test('a divisão exata continua igual: R$ 100,00 em 3x = 33,34 + 33,33 + 33,33', async () => {
    const { valores } = await lancar('Parc exata', { valor: '100,00', parcelas: '3' });
    expect(valores).toEqual([33.34, 33.33, 33.33]);
  });
});

describe('valor que não comporta as parcelas', () => {
  test.each([['0,01', 2], ['0,20', 24], ['0,50', 60]])('R$ %s em %ix é recusado com mensagem e nada é gravado', async (valor, parcelas) => {
    const { r, contas } = await lancar(`Parc pequena ${valor}`, { valor, parcelas: String(parcelas) });

    expect(r.status).toBe(200);
    expect(r.text).toContain('cada parcela precisa ser de pelo menos R$ 0,01');
    expect(contas).toHaveLength(0);
  });
});

describe('número de parcelas inválido', () => {
  test.each([['abc'], [''], ['0'], ['-5']])('parcelas = "%s" vira 1x e a conta é gravada', async (parcelas) => {
    const desc = `Parc invalida [${parcelas}]`;
    const { r, contas } = await lancar(desc, { valor: '100,00', parcelas });

    expect(r.status).toBe(302);
    expect(contas).toHaveLength(1);
    expect(Number(contas[0].valor)).toBe(100);
  });

  test('mais de 60 parcelas é limitado a 60', async () => {
    const { contas } = await lancar('Parc 61', { valor: '100,00', parcelas: '61' });
    expect(contas).toHaveLength(60);
  });
});
