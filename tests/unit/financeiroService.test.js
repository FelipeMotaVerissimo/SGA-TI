jest.mock('../../src/config/database', () => ({
  contaPagar:   { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  contaReceber: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  $transaction: jest.fn(),
}));

const prisma     = require('../../src/config/database');
const financeiro = require('../../src/services/financeiroService');

function dias(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

describe('financeiroService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('validarValor', () => {
    test('aceita vírgula e normaliza', () => {
      expect(financeiro.validarValor('1.240,50'.replace('.', ''))).toBe('1240.50');
      expect(financeiro.validarValor('450')).toBe('450.00');
    });

    test.each([
      ['',    /Informe o valor/],
      ['0',   /maior que zero/],
      ['-1',  /maior que zero/],
      ['abc', /deve ser um número/],
    ])('rejeita %p', (entrada, mensagem) => {
      expect(() => financeiro.validarValor(entrada)).toThrow(mensagem);
    });
  });

  describe('validarDados', () => {
    test('exige descrição com pelo menos 3 caracteres', () => {
      expect(() => financeiro.validarDados({ descricao: 'ab', valor: '10', vencimento: '2026-09-01' }))
        .toThrow(/pelo menos 3 caracteres/);
    });

    test('exige vencimento', () => {
      expect(() => financeiro.validarDados({ descricao: 'Aluguel', valor: '10', vencimento: '' }))
        .toThrow(/Informe a data de vencimento/);
    });

    test('vencimento é montado no fuso local, sem virar o dia anterior', () => {
      const { vencimento } = financeiro.validarDados({
        descricao: 'Aluguel', valor: '10', vencimento: '2026-09-01',
      });
      expect(vencimento.getDate()).toBe(1);
      expect(vencimento.getMonth()).toBe(8); // setembro
      expect(vencimento.getFullYear()).toBe(2026);
    });
  });

  describe('situacaoExibicao', () => {
    test('conta aberta com vencimento futuro continua ABERTA', () => {
      expect(financeiro.situacaoExibicao({ situacao: 'ABERTA', vencimento: dias(5) })).toBe('ABERTA');
    });

    test('conta aberta vencida vira VENCIDA', () => {
      expect(financeiro.situacaoExibicao({ situacao: 'ABERTA', vencimento: dias(-1) })).toBe('VENCIDA');
    });

    test('vencimento hoje ainda não está vencido', () => {
      expect(financeiro.situacaoExibicao({ situacao: 'ABERTA', vencimento: new Date() })).toBe('ABERTA');
    });

    test('conta paga ou cancelada nunca aparece como vencida', () => {
      expect(financeiro.situacaoExibicao({ situacao: 'PAGA',      vencimento: dias(-30) })).toBe('PAGA');
      expect(financeiro.situacaoExibicao({ situacao: 'CANCELADA', vencimento: dias(-30) })).toBe('CANCELADA');
    });
  });

  describe('editarConta', () => {
    test('altera uma conta ABERTA', async () => {
      prisma.contaPagar.findUnique.mockResolvedValue({ id: 1, situacao: 'ABERTA' });
      prisma.contaPagar.update.mockResolvedValue({});

      await financeiro.editarConta('PAGAR', 1, {
        descricao: 'Aluguel revisado', valor: '2.100,00'.replace('.', ''),
        vencimento: '2026-09-10', fornecedor: 'Imobiliária Central',
      });

      const data = prisma.contaPagar.update.mock.calls[0][0].data;
      expect(data).toMatchObject({ descricao: 'Aluguel revisado', valor: '2100.00' });
      expect(data.fornecedor).toBe('Imobiliária Central');
    });

    test.each(['PAGA', 'CANCELADA'])('recusa edição de conta %s', async (situacao) => {
      prisma.contaReceber.findUnique.mockResolvedValue({ id: 1, situacao });

      await expect(financeiro.editarConta('RECEBER', 1, {
        descricao: 'Tentativa', valor: '10', vencimento: '2026-09-01',
      })).rejects.toThrow(/Só é possível editar uma conta ABERTA/);
      expect(prisma.contaReceber.update).not.toHaveBeenCalled();
    });

    test('conta a receber sem cliente grava clienteId nulo', async () => {
      prisma.contaReceber.findUnique.mockResolvedValue({ id: 1, situacao: 'ABERTA' });
      prisma.contaReceber.update.mockResolvedValue({});

      await financeiro.editarConta('RECEBER', 1, {
        descricao: 'Serviço avulso', valor: '150', vencimento: '2026-09-01', clienteId: '',
      });

      expect(prisma.contaReceber.update.mock.calls[0][0].data.clienteId).toBeNull();
    });
  });

  describe('quitarConta / cancelarConta', () => {
    test('quita uma conta aberta e grava a data', async () => {
      prisma.contaPagar.findUnique.mockResolvedValue({ id: 1, situacao: 'ABERTA' });
      prisma.contaPagar.update.mockResolvedValue({});

      await financeiro.quitarConta('PAGAR', 1);

      const data = prisma.contaPagar.update.mock.calls[0][0].data;
      expect(data.situacao).toBe('PAGA');
      expect(data.quitadaEm).toBeInstanceOf(Date);
    });

    test('registra quem deu a baixa', async () => {
      prisma.contaPagar.findUnique.mockResolvedValue({ id: 1, situacao: 'ABERTA' });
      prisma.contaPagar.update.mockResolvedValue({});

      await financeiro.quitarConta('PAGAR', 1, 5);

      expect(prisma.contaPagar.update.mock.calls[0][0].data.quitadaPorId).toBe(5);
    });

    test.each(['PAGA', 'CANCELADA'])('não quita conta %s', async (situacao) => {
      prisma.contaReceber.findUnique.mockResolvedValue({ id: 1, situacao });

      await expect(financeiro.quitarConta('RECEBER', 1)).rejects.toThrow(/Só é possível quitar/);
      expect(prisma.contaReceber.update).not.toHaveBeenCalled();
    });

    test('não cancela conta já paga', async () => {
      prisma.contaPagar.findUnique.mockResolvedValue({ id: 1, situacao: 'PAGA' });

      await expect(financeiro.cancelarConta('PAGAR', 1)).rejects.toThrow(/Só é possível cancelar/);
    });

    test('tipo inválido é rejeitado', async () => {
      await expect(financeiro.quitarConta('OUTRO', 1)).rejects.toThrow(/Tipo de conta inválido/);
    });
  });

  describe('calcularValorDaOrdem', () => {
    const itens = [{ quantidade: 2, valorUnit: '100.00' }];

    // Regra desde 3e859a0 (12/11/2026): cobra-se o total real da OS
    // (serviços + peças); o orçamento só vale quando os dois somam zero.
    test('com serviços e peças lançados, cobra serviços + peças', () => {
      const r = financeiro.calcularValorDaOrdem({
        valorOrcamento: '890.00', itens, servicos: [{ valor: '150.00' }, { valor: null }],
      });
      expect(r.valor).toBe(350);
      expect(r.servicos).toBe(150);
      expect(r.pecas).toBe(200);
      expect(r.orcamento).toBe(890);
    });

    test('com peças lançadas, o orçamento não é somado (nada cobrado duas vezes)', () => {
      const r = financeiro.calcularValorDaOrdem({ valorOrcamento: '890.00', itens });
      expect(r.valor).toBe(200);
    });

    test('sem serviços com valor e sem peças, cobra o orçamento', () => {
      const r = financeiro.calcularValorDaOrdem({
        valorOrcamento: '890.00', itens: [], servicos: [{ valor: null }],
      });
      expect(r.valor).toBe(890);
    });

    test('sem orçamento, cobra a soma das peças', () => {
      const r = financeiro.calcularValorDaOrdem({ valorOrcamento: null, itens });
      expect(r.valor).toBe(200);
    });

    test('sem orçamento e sem peças, valor zero', () => {
      expect(financeiro.calcularValorDaOrdem({ valorOrcamento: null, itens: [] }).valor).toBe(0);
    });
  });

  describe('gerarContaDaOrdem', () => {
    const ordem = {
      id: 4,
      numero: 'OS-2026-000104',
      valorOrcamento: '890.00',
      itens: [{ quantidade: 2, valorUnit: '24.50' }],
      servicos: [{ valor: '300.00' }],
      equipamento: { cliente: { id: 7, nome: 'Marcos Almeida' } },
    };

    function txFake(contaExistente = null) {
      return {
        contaReceber: {
          findUnique: jest.fn().mockResolvedValue(contaExistente),
          create:     jest.fn().mockImplementation(async (a) => ({ id: 1, ...a.data })),
        },
      };
    }

    test('cria a conta vinculada à OS e ao cliente', async () => {
      const tx = txFake();

      const conta = await financeiro.gerarContaDaOrdem(tx, ordem);

      expect(conta).toMatchObject({ ordemId: 4, clienteId: 7, valor: '349.00' }); // 300 + 49
      expect(conta.descricao).toBe('OS OS-2026-000104 — Marcos Almeida');
    });

    test('as observações registram serviços, peças e orçamento, para conferência', async () => {
      const tx = txFake();

      const conta = await financeiro.gerarContaDaOrdem(tx, ordem);

      expect(conta.observacoes).toMatch(/Serviços: R\$ 300\.00/);
      expect(conta.observacoes).toMatch(/Peças: R\$ 49\.00/);
      expect(conta.observacoes).toMatch(/Orçamento inicial: R\$ 890\.00/);
    });

    test('não duplica a conta se a OS já tiver uma', async () => {
      const tx = txFake({ id: 9, ordemId: 4 });

      expect(await financeiro.gerarContaDaOrdem(tx, ordem)).toBeNull();
      expect(tx.contaReceber.create).not.toHaveBeenCalled();
    });

    test('OS sem valor nenhum não gera conta', async () => {
      const tx = txFake();

      const conta = await financeiro.gerarContaDaOrdem(tx, {
        ...ordem, valorOrcamento: null, itens: [], servicos: [],
      });

      expect(conta).toBeNull();
      expect(tx.contaReceber.create).not.toHaveBeenCalled();
    });
  });

  describe('resumo', () => {
    test('soma as contas abertas e conta as vencidas', async () => {
      prisma.contaPagar.findMany.mockResolvedValue([
        { valor: '1240.50', situacao: 'ABERTA', vencimento: dias(10) },
        { valor: '2300.00', situacao: 'ABERTA', vencimento: dias(-3) },
      ]);
      prisma.contaReceber.findMany.mockResolvedValue([
        { valor: '450.00', situacao: 'ABERTA', vencimento: dias(-5) },
      ]);

      const r = await financeiro.resumo();

      expect(r.aPagar).toBe(3540.5);
      expect(r.aReceber).toBe(450);
      expect(r.saldo).toBe(-3090.5);
      expect(r.vencidasPagar).toBe(1);
      expect(r.vencidasReceber).toBe(1);
    });
  });
});
