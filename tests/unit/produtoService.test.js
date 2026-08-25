jest.mock('../../src/config/database', () => ({
  produto: {
    findMany:   jest.fn(),
    findFirst:  jest.fn(),
    findUnique: jest.fn(),
    create:     jest.fn(),
    update:     jest.fn(),
  },
  movimentoEstoque: {
    findMany: jest.fn(),
    create:   jest.fn(),
  },
  contaPagar: { create: jest.fn() },
  $transaction: jest.fn(),
}));

const prisma  = require('../../src/config/database');
const produto = require('../../src/services/produtoService');

/**
 * Transação falsa. `estoqueAtual` é o saldo que o "banco" tem antes da
 * escrita: o service manda `{ increment }` / `{ decrement }` e quem resolve a
 * conta é o banco, então o mock precisa fazer o mesmo para devolver o saldo real.
 */
function transacaoFake(estoqueAtual = 0) {
  const tx = {
    produto:          { create: jest.fn(), update: jest.fn() },
    movimentoEstoque: { create: jest.fn() },
    contaPagar:       { create: jest.fn().mockImplementation(async (a) => ({ id: 1, ...a.data })) },
  };
  tx.produto.create.mockImplementation(async (args) => ({ id: 1, ...args.data }));
  tx.produto.update.mockImplementation(async (args) => {
    const dados = { ...args.data };
    if (dados.estoque && typeof dados.estoque === 'object') {
      dados.estoque = 'increment' in dados.estoque
        ? estoqueAtual + dados.estoque.increment
        : estoqueAtual - dados.estoque.decrement;
    }
    return { id: args.where.id, ...dados };
  });
  tx.movimentoEstoque.create.mockImplementation(async (args) => ({ id: 1, ...args.data }));
  prisma.$transaction.mockImplementation((fn) => fn(tx));
  return tx;
}

describe('produtoService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('validarPreco', () => {
    test('aceita vírgula como separador decimal', () => {
      expect(produto.validarPreco('189,90')).toBe('189.90');
    });

    test('normaliza para duas casas', () => {
      expect(produto.validarPreco(12)).toBe('12.00');
      expect(produto.validarPreco('7.5')).toBe('7.50');
    });

    test.each([
      ['',        /Informe o preço/],
      ['abc',     /deve ser um número/],
      ['0',       /maior que zero/],
      ['-10',     /maior que zero/],
      ['99999999', /excede o limite/],
    ])('rejeita %p', (entrada, mensagem) => {
      expect(() => produto.validarPreco(entrada)).toThrow(mensagem);
    });
  });

  describe('validarQuantidade', () => {
    test('aceita inteiro positivo', () => {
      expect(produto.validarQuantidade('7')).toBe(7);
    });

    test.each([
      ['',    /é obrigatória/],
      ['0',   /maior que zero/],
      ['-3',  /maior que zero/],
      ['2.5', /número inteiro/],
    ])('rejeita %p', (entrada, mensagem) => {
      expect(() => produto.validarQuantidade(entrada)).toThrow(mensagem);
    });
  });

  describe('validarTipo', () => {
    test('normaliza para maiúsculas', () => {
      expect(produto.validarTipo('entrada')).toBe('ENTRADA');
      expect(produto.validarTipo(' saida ')).toBe('SAIDA');
    });

    test('rejeita tipo desconhecido', () => {
      expect(() => produto.validarTipo('TRANSFERENCIA')).toThrow(/Tipo de movimentação inválido/);
    });
  });

  describe('criarProduto', () => {
    test('rejeita nome já cadastrado', async () => {
      prisma.produto.findFirst.mockResolvedValue({ id: 9, nome: 'Pasta térmica' });

      await expect(produto.criarProduto({ nome: 'Pasta térmica', preco: '24,50' }))
        .rejects.toThrow(/Já existe um produto/);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    test('estoque inicial vira um movimento de ENTRADA', async () => {
      prisma.produto.findFirst.mockResolvedValue(null);
      const tx = transacaoFake();

      await produto.criarProduto({ nome: 'Fonte ATX', preco: '259', estoque: '5' });

      expect(tx.produto.create.mock.calls[0][0].data.estoque).toBe(5);
      expect(tx.movimentoEstoque.create).toHaveBeenCalledTimes(1);
      expect(tx.movimentoEstoque.create.mock.calls[0][0].data).toMatchObject({
        tipo: 'ENTRADA', quantidade: 5,
      });
    });

    test('sem estoque inicial não gera movimento', async () => {
      prisma.produto.findFirst.mockResolvedValue(null);
      const tx = transacaoFake();

      await produto.criarProduto({ nome: 'Fonte ATX', preco: '259' });

      expect(tx.movimentoEstoque.create).not.toHaveBeenCalled();
    });

    test('rejeita estoque inicial negativo', async () => {
      prisma.produto.findFirst.mockResolvedValue(null);

      await expect(produto.criarProduto({ nome: 'Fonte ATX', preco: '259', estoque: '-1' }))
        .rejects.toThrow(/igual ou maior que zero/);
    });
  });

  describe('atualizarProduto', () => {
    test('não altera o estoque, mesmo se o formulário mandar', async () => {
      prisma.produto.findUnique.mockResolvedValue({ id: 1, nome: 'Pasta térmica', estoque: 40, ativo: true });
      prisma.produto.findFirst.mockResolvedValue(null);
      prisma.produto.update.mockResolvedValue({});

      await produto.atualizarProduto(1, { nome: 'Pasta térmica', preco: '30', estoque: '999' });

      expect(prisma.produto.update.mock.calls[0][0].data).toEqual({
        nome: 'Pasta térmica', descricao: null, preco: '30.00',
      });
    });

    test('rejeita nome já usado por outro produto', async () => {
      prisma.produto.findUnique.mockResolvedValue({ id: 1, nome: 'Pasta térmica', ativo: true });
      prisma.produto.findFirst.mockResolvedValue({ id: 2, nome: 'Memória DDR4' });

      await expect(produto.atualizarProduto(1, { nome: 'Memória DDR4', preco: '10' }))
        .rejects.toThrow(/outro produto/);
    });
  });

  describe('movimentarEstoque', () => {
    test('ENTRADA soma ao saldo', async () => {
      prisma.produto.findUnique.mockResolvedValue({ id: 1, nome: 'Pasta térmica', estoque: 40, ativo: true });
      transacaoFake(40);

      const { produto: atualizado, aviso } = await produto.movimentarEstoque(1, {
        tipo: 'ENTRADA', quantidade: '10',
      });

      expect(atualizado.estoque).toBe(50);
      expect(aviso).toBeNull();
    });

    test('SAIDA subtrai do saldo', async () => {
      prisma.produto.findUnique.mockResolvedValue({ id: 1, nome: 'Pasta térmica', estoque: 40, ativo: true });
      transacaoFake(40);

      const { produto: atualizado } = await produto.movimentarEstoque(1, {
        tipo: 'SAIDA', quantidade: '15',
      });

      expect(atualizado.estoque).toBe(25);
    });

    test('saída maior que o saldo é permitida, mas devolve aviso (decisão do projeto)', async () => {
      prisma.produto.findUnique.mockResolvedValue({ id: 1, nome: 'Fonte ATX', estoque: 2, ativo: true });
      transacaoFake(2);

      const { produto: atualizado, aviso } = await produto.movimentarEstoque(1, {
        tipo: 'SAIDA', quantidade: '5',
      });

      expect(atualizado.estoque).toBe(-3);
      expect(aviso).toMatch(/ficou negativo \(-3\)/);
    });

    test('o saldo é ajustado com decrement, não com valor calculado em memória', async () => {
      // Protege contra lost update: duas saídas simultâneas leem o mesmo saldo
      // antigo, e uma escrita com valor fixo apagaria a outra.
      prisma.produto.findUnique.mockResolvedValue({ id: 1, nome: 'Pasta térmica', estoque: 40, ativo: true });
      const tx = transacaoFake(40);

      await produto.movimentarEstoque(1, { tipo: 'SAIDA', quantidade: '15' });

      expect(tx.produto.update.mock.calls[0][0].data.estoque).toEqual({ decrement: 15 });
    });

    test('ENTRADA usa increment', async () => {
      prisma.produto.findUnique.mockResolvedValue({ id: 1, nome: 'Pasta térmica', estoque: 40, ativo: true });
      const tx = transacaoFake(40);

      await produto.movimentarEstoque(1, { tipo: 'ENTRADA', quantidade: '10' });

      expect(tx.produto.update.mock.calls[0][0].data.estoque).toEqual({ increment: 10 });
    });

    test('movimento e saldo são gravados na mesma transação', async () => {
      prisma.produto.findUnique.mockResolvedValue({ id: 1, nome: 'Pasta térmica', estoque: 40, ativo: true });
      const tx = transacaoFake(40);

      await produto.movimentarEstoque(1, { tipo: 'ENTRADA', quantidade: '10' });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.movimentoEstoque.create).toHaveBeenCalledTimes(1);
      expect(tx.produto.update).toHaveBeenCalledTimes(1);
      // nenhuma escrita de saldo fora da transação
      expect(prisma.produto.update).not.toHaveBeenCalled();
    });

    test('bloqueia movimentação de produto inativo', async () => {
      prisma.produto.findUnique.mockResolvedValue({ id: 1, nome: 'Cabo flat', estoque: 3, ativo: false });

      await expect(produto.movimentarEstoque(1, { tipo: 'ENTRADA', quantidade: '1' }))
        .rejects.toThrow(/produto inativo/);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    test('registra quem fez a movimentação', async () => {
      prisma.produto.findUnique.mockResolvedValue({ id: 1, nome: 'Pasta térmica', estoque: 40, ativo: true });
      const tx = transacaoFake(40);

      await produto.movimentarEstoque(1, { tipo: 'ENTRADA', quantidade: '1' }, 7);

      expect(tx.movimentoEstoque.create.mock.calls[0][0].data.usuarioId).toBe(7);
    });

    test('ENTRADA com gerarContaPagar lança a conta na mesma transação', async () => {
      prisma.produto.findUnique.mockResolvedValue({ id: 4, nome: 'Fonte ATX', estoque: -1, ativo: true });
      const tx = transacaoFake(-1);

      const { conta } = await produto.movimentarEstoque(4, {
        tipo: 'ENTRADA', quantidade: '6',
        gerarContaPagar: '1', valorCompra: '1554,00', vencimentoCompra: '2026-09-15',
        fornecedorCompra: 'Distribuidora TecParts',
      });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.contaPagar.create).toHaveBeenCalledTimes(1);
      expect(conta).toMatchObject({
        valor: '1554.00', fornecedor: 'Distribuidora TecParts',
        descricao: 'Compra de 6x Fonte ATX',
      });
    });

    test('sem marcar a opção, nenhuma conta é criada', async () => {
      prisma.produto.findUnique.mockResolvedValue({ id: 4, nome: 'Fonte ATX', estoque: 0, ativo: true });
      const tx = transacaoFake(0);

      await produto.movimentarEstoque(4, { tipo: 'ENTRADA', quantidade: '6' });

      expect(tx.contaPagar.create).not.toHaveBeenCalled();
    });

    test('SAIDA ignora a geração de conta a pagar', async () => {
      prisma.produto.findUnique.mockResolvedValue({ id: 4, nome: 'Fonte ATX', estoque: 5, ativo: true });
      const tx = transacaoFake(5);

      await produto.movimentarEstoque(4, {
        tipo: 'SAIDA', quantidade: '1',
        gerarContaPagar: '1', valorCompra: '100', vencimentoCompra: '2026-09-15',
      });

      expect(tx.contaPagar.create).not.toHaveBeenCalled();
    });

    test('conta a pagar sem valor é recusada antes de gravar o movimento', async () => {
      prisma.produto.findUnique.mockResolvedValue({ id: 4, nome: 'Fonte ATX', estoque: 0, ativo: true });

      await expect(produto.movimentarEstoque(4, {
        tipo: 'ENTRADA', quantidade: '6', gerarContaPagar: '1', vencimentoCompra: '2026-09-15',
      })).rejects.toThrow(/Informe o valor/);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    test('produto inexistente devolve 404', async () => {
      prisma.produto.findUnique.mockResolvedValue(null);

      await expect(produto.movimentarEstoque(99, { tipo: 'ENTRADA', quantidade: '1' }))
        .rejects.toMatchObject({ status: 404 });
    });

    test('descrição é limitada a 200 caracteres', async () => {
      prisma.produto.findUnique.mockResolvedValue({ id: 1, nome: 'Pasta térmica', estoque: 40, ativo: true });
      const tx = transacaoFake();

      await produto.movimentarEstoque(1, { tipo: 'ENTRADA', quantidade: '1', descricao: 'x'.repeat(300) });

      expect(tx.movimentoEstoque.create.mock.calls[0][0].data.descricao).toHaveLength(200);
    });
  });
});
