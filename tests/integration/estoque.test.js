require('../helpers/ambiente'); // precisa vir antes de src/app

const request = require('supertest');
const app     = require('../../src/app');
const { semear, logar, saldo, prisma } = require('../helpers/fixture');

/**
 * Módulo 4 — Produtos e Estoque (RF014 / RF015).
 *
 * O que os unitários não provam: a movimentação chega até o banco pela rota,
 * o saldo e o razão continuam batendo, e a saída para a OS acontece junto com
 * o item, na mesma transação.
 */

let dados;

beforeEach(async () => { dados = await semear(); });
afterAll(async () => { await prisma.$disconnect(); });

describe('cadastro de produto', () => {
  test('cria com preço em vírgula e estoque inicial vira ENTRADA', async () => {
    const agente = await logar(request, app, 'compras');

    await agente.post('/produtos').type('form')
      .send({ nome: 'Peça nova', preco: '189,90', estoque: '5' });

    const criado = await prisma.produto.findFirst({ where: { nome: 'Peça nova' } });
    expect(Number(criado.preco)).toBe(189.9);
    expect(criado.estoque).toBe(5);

    const movimentos = await prisma.movimentoEstoque.findMany({ where: { produtoId: criado.id } });
    expect(movimentos).toHaveLength(1);
    expect(movimentos[0]).toMatchObject({ tipo: 'ENTRADA', quantidade: 5 });
  });

  test('nome duplicado é recusado e o preço digitado volta no formulário', async () => {
    const agente = await logar(request, app, 'compras');

    const r = await agente.post('/produtos').type('form')
      .send({ nome: dados.produtos.normal.nome, preco: '31,50' });

    expect(r.text).toContain('Já existe um produto');
    expect(r.text).toContain('value="31,50"');  // não pode voltar como NaN
    expect(await prisma.produto.count({ where: { nome: dados.produtos.normal.nome } })).toBe(1);
  });

  test('desativação é lógica e preserva o produto', async () => {
    const agente = await logar(request, app, 'compras');
    await agente.post(`/produtos/${dados.produtos.normal.id}/excluir`).type('form').send({});

    const produto = await prisma.produto.findUnique({ where: { id: dados.produtos.normal.id } });
    expect(produto).not.toBeNull();
    expect(produto.ativo).toBe(false);
  });
});

describe('movimentação de estoque', () => {
  test('ENTRADA soma e SAÍDA subtrai, com o razão batendo com o saldo', async () => {
    const agente = await logar(request, app, 'compras');
    const id = dados.produtos.normal.id;

    await agente.post(`/produtos/${id}/estoque`).type('form')
      .send({ tipo: 'ENTRADA', quantidade: '10', descricao: 'NF 123' });
    expect(await saldo(id)).toBe(20);

    await agente.post(`/produtos/${id}/estoque`).type('form')
      .send({ tipo: 'SAIDA', quantidade: '4' });
    expect(await saldo(id)).toBe(16);

    const movimentos = await prisma.movimentoEstoque.findMany({ where: { produtoId: id } });
    const somaRazao = movimentos.reduce(
      (s, m) => s + (m.tipo === 'ENTRADA' ? m.quantidade : -m.quantidade), 0
    );
    expect(somaRazao).toBe(await saldo(id));
  });

  test('saída acima do saldo é permitida, mas avisa (decisão D1 do projeto)', async () => {
    const agente = await logar(request, app, 'compras');
    const id = dados.produtos.zerado.id;

    const r = await agente.post(`/produtos/${id}/estoque`).type('form')
      .send({ tipo: 'SAIDA', quantidade: '3' });

    expect(await saldo(id)).toBe(-3);

    const tela = await agente.get(r.headers.location);
    expect(tela.text).toContain('ficou negativo (-3)');
  });

  test('registra qual usuário fez a movimentação', async () => {
    const agente = await logar(request, app, 'compras');

    await agente.post(`/produtos/${dados.produtos.normal.id}/estoque`).type('form')
      .send({ tipo: 'ENTRADA', quantidade: '1' });

    const mov = await prisma.movimentoEstoque.findFirst({
      where: { produtoId: dados.produtos.normal.id },
      include: { usuario: true },
    });
    expect(mov.usuario.login).toBe('compras');
  });

  test('ENTRADA pode lançar a conta a pagar da compra, na mesma transação', async () => {
    const agente = await logar(request, app, 'compras');

    await agente.post(`/produtos/${dados.produtos.normal.id}/estoque`).type('form').send({
      tipo: 'ENTRADA', quantidade: '6',
      gerarContaPagar: '1', valorCompra: '1554,00',
      vencimentoCompra: '2026-12-15', fornecedorCompra: 'Fornecedor X',
    });

    const conta = await prisma.contaPagar.findFirst({ where: { fornecedor: 'Fornecedor X' } });
    expect(Number(conta.valor)).toBe(1554);
    expect(await saldo(dados.produtos.normal.id)).toBe(16);
  });

  test('conta a pagar inválida aborta a movimentação inteira', async () => {
    const agente = await logar(request, app, 'compras');
    const antes = await saldo(dados.produtos.normal.id);
    const contasAntes = await prisma.contaPagar.count();

    await agente.post(`/produtos/${dados.produtos.normal.id}/estoque`).type('form').send({
      tipo: 'ENTRADA', quantidade: '6', gerarContaPagar: '1', vencimentoCompra: '2026-12-15',
    });

    expect(await saldo(dados.produtos.normal.id)).toBe(antes);
    expect(await prisma.contaPagar.count()).toBe(contasAntes);
  });

  test('produto inativo não aceita movimentação', async () => {
    const agente = await logar(request, app, 'compras');
    const antes = await saldo(dados.produtos.inativo.id);

    await agente.post(`/produtos/${dados.produtos.inativo.id}/estoque`).type('form')
      .send({ tipo: 'ENTRADA', quantidade: '1' });

    expect(await saldo(dados.produtos.inativo.id)).toBe(antes);
  });
});

describe('peças lançadas na OS', () => {
  test('lançar peça dá baixa no estoque e usa o preço de tabela', async () => {
    const agente = await logar(request, app, 'vendedor');

    await agente.post(`/ordens/${dados.ordens.andamento.id}/itens`).type('form')
      .send({ produtoId: String(dados.produtos.normal.id), quantidade: '2', valorUnit: '' });

    expect(await saldo(dados.produtos.normal.id)).toBe(8);

    const item = await prisma.itemOrdem.findFirst({ where: { ordemId: dados.ordens.andamento.id } });
    expect(Number(item.valorUnit)).toBe(100);

    const mov = await prisma.movimentoEstoque.findFirst({
      where: { produtoId: dados.produtos.normal.id, tipo: 'SAIDA' },
    });
    expect(mov.descricao).toContain(dados.ordens.andamento.numero);
  });

  test('remover a peça estorna a quantidade para o estoque', async () => {
    const agente = await logar(request, app, 'vendedor');

    await agente.post(`/ordens/${dados.ordens.andamento.id}/itens`).type('form')
      .send({ produtoId: String(dados.produtos.normal.id), quantidade: '3' });
    expect(await saldo(dados.produtos.normal.id)).toBe(7);

    const item = await prisma.itemOrdem.findFirst({ where: { ordemId: dados.ordens.andamento.id } });
    await agente.post(`/ordens/${dados.ordens.andamento.id}/itens/${item.id}/remover`).type('form').send({});

    expect(await saldo(dados.produtos.normal.id)).toBe(10);
    expect(await prisma.itemOrdem.count()).toBe(0);
  });

  test.each([
    ['INICIAL',    'inicial'],
    ['ORCAMENTO',  'orcamento'],
    ['FINALIZADO', 'finalizado'],
    ['CANCELADO',  'cancelado'],
  ])('OS %s não aceita lançamento de peça', async (_status, chave) => {
    const agente = await logar(request, app, 'vendedor');

    await agente.post(`/ordens/${dados.ordens[chave].id}/itens`).type('form')
      .send({ produtoId: String(dados.produtos.normal.id), quantidade: '1' });

    expect(await prisma.itemOrdem.count()).toBe(0);
    expect(await saldo(dados.produtos.normal.id)).toBe(10);
  });

  test('não é possível remover item pela OS errada', async () => {
    const agente = await logar(request, app, 'vendedor');

    await agente.post(`/ordens/${dados.ordens.andamento.id}/itens`).type('form')
      .send({ produtoId: String(dados.produtos.normal.id), quantidade: '1' });
    const item = await prisma.itemOrdem.findFirst();

    await agente.post(`/ordens/${dados.ordens.autorizado.id}/itens/${item.id}/remover`).type('form').send({});

    expect(await prisma.itemOrdem.count()).toBe(1);
    expect(await saldo(dados.produtos.normal.id)).toBe(9);
  });
});
