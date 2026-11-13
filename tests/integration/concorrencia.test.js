require('../helpers/ambiente'); // precisa vir antes de src/app

const ordemServicoService = require('../../src/services/ordemServicoService');
const produtoService      = require('../../src/services/produtoService');
const { semear, prisma }  = require('../helpers/fixture');

/**
 * Concorrência (bateria da 6ª Etapa, 13/11/2026): duas pessoas — ou um clique
 * duplo — fazendo a mesma coisa ao mesmo tempo. Roda em SQLite localmente e
 * em MySQL 8 no CI, onde as transações correm de fato em paralelo.
 */

const EM_MYSQL = /^mysql:/.test(process.env.DATABASE_URL);

let dados;

beforeAll(async () => { dados = await semear(); });
afterAll(async () => { await prisma.$disconnect(); });

test('faturar a mesma OS duas vezes ao mesmo tempo gera uma conta só', async () => {
  const id = dados.ordens.andamento.id;

  const r = await Promise.allSettled([
    ordemServicoService.faturarEEncerrar(id),
    ordemServicoService.faturarEEncerrar(id),
  ]);

  expect(r.some((x) => x.status === 'fulfilled')).toBe(true);
  expect(await prisma.contaReceber.count({ where: { ordemId: id } })).toBe(1);
  const os = await prisma.ordemServico.findUnique({ where: { id } });
  expect(os.status).toBe('FINALIZADO');
});

// Só no MySQL (CI): o SQLite local aceita um escritor por vez, derruba por
// tempo as transações que esperam e as deixa terminando depois do teste —
// limitação do banco de desenvolvimento, não do sistema.
(EM_MYSQL ? test : test.skip)('10 saídas de estoque simultâneas baixam exatamente 10 unidades', async () => {
  const id = dados.produtos.normal.id;
  const antes = (await prisma.produto.findUnique({ where: { id } })).estoque;

  const r = await Promise.allSettled(Array.from({ length: 10 }, (_, i) =>
    produtoService.movimentarEstoque(id, { tipo: 'SAIDA', quantidade: '1', descricao: `Saída simultânea ${i}` })
  ));

  expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(10);
  // Nenhuma baixa se perde nem é contada duas vezes.
  const depois = (await prisma.produto.findUnique({ where: { id } })).estoque;
  expect(depois).toBe(antes - 10);
  expect(await prisma.movimentoEstoque.count({
    where: { produtoId: id, descricao: { startsWith: 'Saída simultânea' } },
  })).toBe(10);
});
