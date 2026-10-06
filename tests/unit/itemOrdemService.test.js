jest.mock('../../src/config/database', () => ({
  ordemServico: { findUnique: jest.fn() },
  itemOrdem:    { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), delete: jest.fn() },
  produto:      { findUnique: jest.fn(), update: jest.fn() },
  movimentoEstoque: { create: jest.fn() },
  $transaction: jest.fn(),
}));

const prisma = require('../../src/config/database');
const item   = require('../../src/services/itemOrdemService');

/** `estoqueAtual` = saldo no banco antes da escrita (ver produtoService.test.js). */
function transacaoFake(estoqueAtual = 0) {
  const tx = {
    itemOrdem:        { create: jest.fn(), delete: jest.fn() },
    produto:          { update: jest.fn() },
    movimentoEstoque: { create: jest.fn() },
  };
  tx.itemOrdem.create.mockImplementation(async (args) => ({ id: 1, ...args.data }));
  tx.itemOrdem.delete.mockResolvedValue({});
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

const OS_ANDAMENTO = { id: 4, numero: 'OS-2026-000104', status: 'EM_ANDAMENTO' };
const PRODUTO      = { id: 1, nome: 'Memória DDR4 8GB', preco: '189.90', estoque: 11, ativo: true };

describe('itemOrdemService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('podeLancarItem', () => {
    test.each([
      ['AUTORIZADO',   true],
      ['EM_ANDAMENTO', true],
      ['INICIAL',      false],
      ['ORCAMENTO',    false],
      ['CANCELADO',    false],
      ['FINALIZADO',   false],
    ])('status %s -> %p', (status, esperado) => {
      expect(item.podeLancarItem(status)).toBe(esperado);
    });
  });

  describe('alçada de desconto (entrevista, item 8)', () => {
    test('calcularDesconto devolve o percentual abaixo da tabela', () => {
      expect(item.calcularDesconto(100, 90)).toBeCloseTo(10);
      expect(item.calcularDesconto(100, 50)).toBeCloseTo(50);
    });

    test('preço igual ou acima da tabela não é desconto', () => {
      expect(item.calcularDesconto(100, 100)).toBe(0);
      expect(item.calcularDesconto(100, 120)).toBe(0);
    });

    test('desconto dentro do limite passa sem perfil especial', () => {
      expect(() => item.validarAlcadaDesconto({ nome: 'X', preco: 100 }, 92, 'VENDEDOR'))
        .not.toThrow();
    });

    test('desconto acima do limite é recusado para o vendedor', () => {
      expect(() => item.validarAlcadaDesconto({ nome: 'X', preco: 100 }, 70, 'VENDEDOR'))
        .toThrow(/precisa de liberação/);
    });

    test('administrador libera qualquer desconto', () => {
      expect(() => item.validarAlcadaDesconto({ nome: 'X', preco: 100 }, 70, 'ADMINISTRADOR'))
        .not.toThrow();
    });

    test('lancarItem bloqueia desconto fora da alçada', async () => {
      prisma.ordemServico.findUnique.mockResolvedValue(OS_ANDAMENTO);
      prisma.produto.findUnique.mockResolvedValue(PRODUTO);
      transacaoFake();

      await expect(item.lancarItem(
        4, { produtoId: 1, quantidade: '1', valorUnit: '100,00' }, { perfil: 'VENDEDOR' }
      )).rejects.toThrow(/precisa de liberação/);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    test('lancarItem aceita o mesmo desconto com perfil de gerência', async () => {
      prisma.ordemServico.findUnique.mockResolvedValue(OS_ANDAMENTO);
      prisma.produto.findUnique.mockResolvedValue(PRODUTO);
      const tx = transacaoFake(11);

      await item.lancarItem(
        4, { produtoId: 1, quantidade: '1', valorUnit: '100,00' }, { perfil: 'ADMINISTRADOR' }
      );

      expect(tx.itemOrdem.create.mock.calls[0][0].data.valorUnit).toBe('100.00');
    });

    test('sem valor informado o preço de tabela nunca cai na alçada', async () => {
      prisma.ordemServico.findUnique.mockResolvedValue(OS_ANDAMENTO);
      prisma.produto.findUnique.mockResolvedValue(PRODUTO);
      const tx = transacaoFake(11);

      await item.lancarItem(4, { produtoId: 1, quantidade: '1' }, { perfil: 'VENDEDOR' });

      expect(tx.itemOrdem.create.mock.calls[0][0].data.valorUnit).toBe('189.90');
    });
  });

  describe('calcularTotalItens', () => {
    test('soma quantidade x valor unitário', () => {
      expect(item.calcularTotalItens([
        { quantidade: 2, valorUnit: '189.90' },
        { quantidade: 3, valorUnit: '24.50' },
      ])).toBe(453.3);
    });

    test('lista vazia soma zero', () => {
      expect(item.calcularTotalItens([])).toBe(0);
      expect(item.calcularTotalItens()).toBe(0);
    });
  });

  describe('lancarItem', () => {
    test('bloqueia lançamento fora de AUTORIZADO/EM_ANDAMENTO', async () => {
      prisma.ordemServico.findUnique.mockResolvedValue({ ...OS_ANDAMENTO, status: 'ORCAMENTO' });

      await expect(item.lancarItem(4, { produtoId: 1, quantidade: '1' }))
        .rejects.toThrow(/Não é possível lançar produtos/);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    test('valor unitário em branco assume o preço do produto', async () => {
      prisma.ordemServico.findUnique.mockResolvedValue(OS_ANDAMENTO);
      prisma.produto.findUnique.mockResolvedValue(PRODUTO);
      const tx = transacaoFake();

      await item.lancarItem(4, { produtoId: 1, quantidade: '2', valorUnit: '' });

      expect(tx.itemOrdem.create.mock.calls[0][0].data.valorUnit).toBe('189.90');
    });

    test('valor negociado dentro da alçada substitui o preço de tabela', async () => {
      prisma.ordemServico.findUnique.mockResolvedValue(OS_ANDAMENTO);
      prisma.produto.findUnique.mockResolvedValue(PRODUTO);
      const tx = transacaoFake();

      // 175,00 sobre 189,90 = 7,8% de desconto, abaixo do limite livre
      await item.lancarItem(4, { produtoId: 1, quantidade: '1', valorUnit: '175,00' });

      expect(tx.itemOrdem.create.mock.calls[0][0].data.valorUnit).toBe('175.00');
    });

    test('gera a saída de estoque na mesma transação do item', async () => {
      prisma.ordemServico.findUnique.mockResolvedValue(OS_ANDAMENTO);
      prisma.produto.findUnique.mockResolvedValue(PRODUTO);
      const tx = transacaoFake(11);

      await item.lancarItem(4, { produtoId: 1, quantidade: '2' });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.movimentoEstoque.create.mock.calls[0][0].data).toMatchObject({
        tipo: 'SAIDA', quantidade: 2, descricao: 'Saída para a OS OS-2026-000104',
      });
      // decrement, e não 9 calculado em memória — evita lost update
      expect(tx.produto.update.mock.calls[0][0].data.estoque).toEqual({ decrement: 2 });
    });

    test('saldo insuficiente não bloqueia, mas devolve aviso', async () => {
      prisma.ordemServico.findUnique.mockResolvedValue(OS_ANDAMENTO);
      prisma.produto.findUnique.mockResolvedValue({ ...PRODUTO, estoque: 1 });
      transacaoFake(1);

      const { aviso } = await item.lancarItem(4, { produtoId: 1, quantidade: '3' });

      expect(aviso).toMatch(/ficou negativo \(-2\)/);
    });

    test('rejeita produto inativo', async () => {
      prisma.ordemServico.findUnique.mockResolvedValue(OS_ANDAMENTO);
      prisma.produto.findUnique.mockResolvedValue({ ...PRODUTO, ativo: false });

      await expect(item.lancarItem(4, { produtoId: 1, quantidade: '1' }))
        .rejects.toThrow(/está inativo/);
    });

    test('rejeita quantidade inválida', async () => {
      prisma.ordemServico.findUnique.mockResolvedValue(OS_ANDAMENTO);
      prisma.produto.findUnique.mockResolvedValue(PRODUTO);

      await expect(item.lancarItem(4, { produtoId: 1, quantidade: '0' }))
        .rejects.toThrow(/maior que zero/);
    });

    test('OS inexistente devolve 404', async () => {
      prisma.ordemServico.findUnique.mockResolvedValue(null);

      await expect(item.lancarItem(99, { produtoId: 1, quantidade: '1' }))
        .rejects.toMatchObject({ status: 404 });
    });
  });

  describe('removerItem', () => {
    const ITEM = {
      id: 7, ordemId: 4, quantidade: 2,
      ordem:   OS_ANDAMENTO,
      produto: PRODUTO,
    };

    test('estorna a quantidade para o estoque', async () => {
      prisma.itemOrdem.findUnique.mockResolvedValue(ITEM);
      const tx = transacaoFake(11);

      await item.removerItem(4, 7);

      expect(tx.itemOrdem.delete).toHaveBeenCalledTimes(1);
      expect(tx.movimentoEstoque.create.mock.calls[0][0].data).toMatchObject({
        tipo: 'ENTRADA', quantidade: 2,
      });
      expect(tx.produto.update.mock.calls[0][0].data.estoque).toEqual({ increment: 2 });
    });

    test('bloqueia remoção cruzada entre ordens', async () => {
      prisma.itemOrdem.findUnique.mockResolvedValue(ITEM);

      await expect(item.removerItem(3, 7)).rejects.toThrow(/não pertence à ordem/);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    test.each(['FINALIZADO', 'CANCELADO'])('bloqueia remoção em OS %s', async (status) => {
      prisma.itemOrdem.findUnique.mockResolvedValue({ ...ITEM, ordem: { ...OS_ANDAMENTO, status } });

      await expect(item.removerItem(4, 7)).rejects.toThrow(/Não é possível remover produtos/);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    test('item inexistente devolve 404', async () => {
      prisma.itemOrdem.findUnique.mockResolvedValue(null);

      await expect(item.removerItem(4, 99)).rejects.toMatchObject({ status: 404 });
    });
  });
});
