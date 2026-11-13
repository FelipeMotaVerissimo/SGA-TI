require('../helpers/ambiente'); // precisa vir antes de src/app

const ordemServicoService = require('../../src/services/ordemServicoService');
const { semear, prisma }  = require('../helpers/fixture');

/**
 * Número da OS repetido (bateria da 6ª Etapa, 13/11/2026), no banco de verdade:
 * o índice único de `numero` recusa o repetido e a abertura tenta outro.
 */

let dados;
let base;

beforeAll(async () => {
  dados = await semear();
  base = { defeitoRelatado: 'Defeito de teste', equipamentoId: dados.equipamento.id };
});
afterEach(() => jest.restoreAllMocks());
afterAll(async () => { await prisma.$disconnect(); });

test('3 OS abertas no mesmo milissegundo recebem números diferentes', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(1763000123456);

  const r = await Promise.allSettled([1, 2, 3].map(() =>
    ordemServicoService.abrirOrdem(base, dados.usuarios.admin.id)));

  expect(r.map((x) => x.status)).toEqual(['fulfilled', 'fulfilled', 'fulfilled']);
  const numeros = r.map((x) => x.value.numero);
  expect(new Set(numeros).size).toBe(3);
  numeros.forEach((n) => expect(n).toMatch(/^OS-\d{4}-\d{6}$/));
});

test('16 min 40 s depois, o relógio repete o número e a OS abre mesmo assim', async () => {
  const t = 1763000654321;
  jest.spyOn(Date, 'now').mockReturnValue(t);
  const antiga = await ordemServicoService.abrirOrdem(base, dados.usuarios.admin.id);

  Date.now.mockReturnValue(t + 1000000);
  const nova = await ordemServicoService.abrirOrdem(base, dados.usuarios.admin.id);

  expect(antiga.numero.endsWith('654321')).toBe(true);
  expect(nova.numero).not.toBe(antiga.numero);
});
