jest.mock('../../src/config/database', () => ({
  ordemServico: { findMany: jest.fn() },
  itemOrdem:    { findMany: jest.fn() },
}));

const prisma    = require('../../src/config/database');
const relatorio = require('../../src/services/relatorioService');

const dias = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
};

/** OS mínima, com o cliente pendurado no equipamento. */
const os = (valorOrcamento, status, cliente, dataAbertura = new Date()) => ({
  valorOrcamento, status, dataAbertura,
  equipamento: { cliente: { id: cliente.id, nome: cliente.nome, cpfCnpj: cliente.cpf } },
});

const MARCOS  = { id: 1, nome: 'Marcos',  cpf: '111' };
const PADARIA = { id: 2, nome: 'Padaria', cpf: '222' };

describe('relatorioService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('resolverPeriodo', () => {
    test('sem filtro, a janela cobre exatamente 30 dias de calendário', () => {
      const { de, ate } = relatorio.resolverPeriodo();

      // de começa à meia-noite e ate termina às 23:59:59.999 — arredondando
      // para cima, a janela tem que dar os 30 dias que o rótulo promete.
      const diasNaJanela = Math.ceil((ate - de) / (24 * 60 * 60 * 1000));
      expect(diasNaJanela).toBe(relatorio.PERIODO_PADRAO_DIAS);

      expect(de.getHours()).toBe(0);
      expect(ate.getHours()).toBe(23);
    });

    test('a data final vale até o fim do dia', () => {
      const { ate } = relatorio.resolverPeriodo({ de: '2026-08-01', ate: '2026-08-31' });
      expect(ate.getDate()).toBe(31);
      expect(ate.getHours()).toBe(23);
      expect(ate.getMinutes()).toBe(59);
    });

    test('monta as datas no fuso local, sem perder um dia', () => {
      const { de } = relatorio.resolverPeriodo({ de: '2026-08-20', ate: '2026-08-31' });
      expect(de.getDate()).toBe(20);
      expect(de.getMonth()).toBe(7); // agosto
    });

    test('recusa período invertido', () => {
      expect(() => relatorio.resolverPeriodo({ de: '2026-12-01', ate: '2026-01-01' }))
        .toThrow(/data inicial não pode ser maior/);
    });

    test('recusa data malformada', () => {
      expect(() => relatorio.resolverPeriodo({ de: '20/08/2026' })).toThrow(/Data inválida/);
    });
  });

  describe('maioresClientes (RF016)', () => {
    test('soma os orçamentos por cliente e ordena do maior para o menor', async () => {
      prisma.ordemServico.findMany.mockResolvedValue([
        os('300', 'FINALIZADO',   MARCOS),
        os('200', 'EM_ANDAMENTO', MARCOS),
        os('900', 'AUTORIZADO',   PADARIA),
      ]);

      const linhas = await relatorio.maioresClientes();

      expect(linhas).toHaveLength(2);
      expect(linhas[0]).toMatchObject({ cliente: 'Padaria', ordens: 1, total: 900 });
      expect(linhas[1]).toMatchObject({ cliente: 'Marcos',  ordens: 2, total: 500 });
    });

    test('calcula o ticket médio', async () => {
      prisma.ordemServico.findMany.mockResolvedValue([
        os('300', 'FINALIZADO', MARCOS),
        os('200', 'FINALIZADO', MARCOS),
      ]);

      const [linha] = await relatorio.maioresClientes();
      expect(linha.ticketMedio).toBe(250);
    });

    test('separa o que o cliente já aprovou do que é só proposta', async () => {
      prisma.ordemServico.findMany.mockResolvedValue([
        os('400', 'AUTORIZADO', MARCOS),  // aprovado
        os('600', 'ORCAMENTO',  MARCOS),  // ainda proposta
      ]);

      const [linha] = await relatorio.maioresClientes();
      expect(linha.total).toBe(1000);
      expect(linha.aprovado).toBe(400);
    });

    test('OS cancelada não entra na consulta — orçamento recusado não é venda', async () => {
      prisma.ordemServico.findMany.mockResolvedValue([]);
      await relatorio.maioresClientes();

      const { where } = prisma.ordemServico.findMany.mock.calls[0][0];
      expect(where.status.notIn).toContain('CANCELADO');
    });

    test('OS sem orçamento conta na quantidade, mas soma zero', async () => {
      prisma.ordemServico.findMany.mockResolvedValue([
        os(null,  'INICIAL',    MARCOS),
        os('500', 'FINALIZADO', MARCOS),
      ]);

      const [linha] = await relatorio.maioresClientes();
      expect(linha.ordens).toBe(2);
      expect(linha.total).toBe(500);
    });

    test('respeita o limite de linhas', async () => {
      prisma.ordemServico.findMany.mockResolvedValue([
        os('100', 'FINALIZADO', MARCOS),
        os('200', 'FINALIZADO', PADARIA),
      ]);

      expect(await relatorio.maioresClientes({ limite: 1 })).toHaveLength(1);
    });

    test('filtra pelo período informado', async () => {
      prisma.ordemServico.findMany.mockResolvedValue([]);
      await relatorio.maioresClientes({ de: '2026-08-01', ate: '2026-08-31' });

      const { where } = prisma.ordemServico.findMany.mock.calls[0][0];
      expect(where.dataAbertura.gte.getDate()).toBe(1);
      expect(where.dataAbertura.lte.getDate()).toBe(31);
    });

    test('período vazio devolve lista vazia, não quebra', async () => {
      prisma.ordemServico.findMany.mockResolvedValue([]);
      expect(await relatorio.maioresClientes()).toEqual([]);
    });
  });

  describe('produtosMaisVendidos (RF018)', () => {
    const item = (produtoId, nome, quantidade, valorUnit) => ({
      produtoId, quantidade, valorUnit,
      produto: { nome, ativo: true },
    });

    test('soma quantidade e receita por produto, ordenando por quantidade', async () => {
      prisma.itemOrdem.findMany.mockResolvedValue([
        item(1, 'Pasta térmica', 2, '24.50'),
        item(1, 'Pasta térmica', 3, '24.50'),
        item(2, 'Memória',       1, '189.90'),
      ]);

      const linhas = await relatorio.produtosMaisVendidos();

      expect(linhas[0]).toMatchObject({ produto: 'Pasta térmica', quantidade: 5, total: 122.5 });
      expect(linhas[1]).toMatchObject({ produto: 'Memória',       quantidade: 1, total: 189.9 });
    });

    test('usa o valor negociado de cada lançamento, não o preço de tabela', async () => {
      prisma.itemOrdem.findMany.mockResolvedValue([
        item(1, 'Peça', 1, '100.00'),
        item(1, 'Peça', 1, '80.00'),   // mesma peça, com desconto
      ]);

      const [linha] = await relatorio.produtosMaisVendidos();
      expect(linha.total).toBe(180);
    });

    test('filtra pela data do lançamento da peça, não pela data da OS', async () => {
      prisma.itemOrdem.findMany.mockResolvedValue([]);
      await relatorio.produtosMaisVendidos({ de: '2026-08-01', ate: '2026-08-31' });

      const { where } = prisma.itemOrdem.findMany.mock.calls[0][0];
      expect(where).toHaveProperty('criadoEm');
      expect(where.criadoEm.gte.getDate()).toBe(1);
    });

    test('produto inativo continua aparecendo, marcado', async () => {
      prisma.itemOrdem.findMany.mockResolvedValue([
        { produtoId: 9, quantidade: 1, valorUnit: '45.00', produto: { nome: 'Cabo flat', ativo: false } },
      ]);

      const [linha] = await relatorio.produtosMaisVendidos();
      expect(linha.ativo).toBe(false);
    });

    test('período sem venda devolve lista vazia', async () => {
      prisma.itemOrdem.findMany.mockResolvedValue([]);
      expect(await relatorio.produtosMaisVendidos()).toEqual([]);
    });
  });
});

/**
 * NF004 — análise geográfica.
 *
 * Requisito que existia no documento desde o começo e nunca tinha sido
 * implementado: os campos já estavam no cadastro e nenhum relatório os usava.
 */
describe('porRegiao (NF004)', () => {
  /** OS com o cliente já posicionado numa cidade. */
  const osEm = (cidade, estado, valor, status = 'FINALIZADO', clienteId = 1) => ({
    valorOrcamento: valor,
    status,
    dataAbertura: new Date(),
    equipamento: { cliente: { id: clienteId, nome: 'Cliente', cidade, estado } },
  });

  beforeEach(() => jest.clearAllMocks());

  test('agrupa por cidade e soma o orçado', async () => {
    prisma.ordemServico.findMany.mockResolvedValue([
      osEm('Dourados', 'MS', 1000, 'FINALIZADO', 1),
      osEm('Dourados', 'MS', 500,  'FINALIZADO', 2),
      osEm('Campo Grande', 'MS', 300, 'FINALIZADO', 3),
    ]);

    const linhas = await relatorio.porRegiao();

    expect(linhas).toHaveLength(2);
    expect(linhas[0]).toMatchObject({
      cidade: 'Dourados', estado: 'MS', ordens: 2, clientes: 2, total: 1500,
    });
    expect(linhas[1]).toMatchObject({ cidade: 'Campo Grande', ordens: 1, total: 300 });
  });

  test('conta clientes distintos, não ordens', async () => {
    prisma.ordemServico.findMany.mockResolvedValue([
      osEm('Dourados', 'MS', 100, 'FINALIZADO', 7),
      osEm('Dourados', 'MS', 100, 'FINALIZADO', 7), // mesmo cliente, outra OS
    ]);

    const [linha] = await relatorio.porRegiao();
    expect(linha.ordens).toBe(2);
    expect(linha.clientes).toBe(1);
  });

  test('cidades de mesmo nome em UF diferente não se misturam', async () => {
    prisma.ordemServico.findMany.mockResolvedValue([
      osEm('Santa Rita', 'MS', 100, 'FINALIZADO', 1),
      osEm('Santa Rita', 'PB', 200, 'FINALIZADO', 2),
    ]);

    const linhas = await relatorio.porRegiao();
    expect(linhas).toHaveLength(2);
    expect(linhas.map((l) => l.estado).sort()).toEqual(['MS', 'PB']);
  });

  test('variação de espaço e caixa é a mesma cidade', async () => {
    prisma.ordemServico.findMany.mockResolvedValue([
      osEm('Dourados', 'MS', 100, 'FINALIZADO', 1),
      osEm(' dourados ', 'ms', 100, 'FINALIZADO', 2),
    ]);

    const linhas = await relatorio.porRegiao();
    expect(linhas).toHaveLength(1);
    expect(linhas[0].ordens).toBe(2);
  });

  test('cliente sem cidade vira "Não informado", nunca some', async () => {
    prisma.ordemServico.findMany.mockResolvedValue([
      osEm('Dourados', 'MS', 100, 'FINALIZADO', 1),
      osEm(null, null, 900, 'FINALIZADO', 2),
      osEm('', '', 50, 'FINALIZADO', 3),
    ]);

    const linhas = await relatorio.porRegiao();
    const semCidade = linhas.find((l) => l.cidade === relatorio.CIDADE_NAO_INFORMADA);

    expect(semCidade).toBeDefined();
    expect(semCidade.ordens).toBe(2);
    expect(semCidade.total).toBe(950);

    // O total do relatório tem que fechar com o que entrou.
    expect(linhas.reduce((t, l) => t + l.total, 0)).toBe(1050);
  });

  test('OS cancelada não entra — mesma regra do RF016', async () => {
    prisma.ordemServico.findMany.mockResolvedValue([]);
    await relatorio.porRegiao();

    const where = prisma.ordemServico.findMany.mock.calls[0][0].where;
    expect(where.status.notIn).toEqual(expect.arrayContaining(['CANCELADO']));
  });

  test('ordena pelo total e respeita o limite', async () => {
    prisma.ordemServico.findMany.mockResolvedValue([
      osEm('A', 'MS', 100, 'FINALIZADO', 1),
      osEm('B', 'MS', 900, 'FINALIZADO', 2),
      osEm('C', 'MS', 500, 'FINALIZADO', 3),
    ]);

    const linhas = await relatorio.porRegiao({ limite: 2 });
    expect(linhas.map((l) => l.cidade)).toEqual(['B', 'C']);
  });

  test('ticket médio é o total dividido pelas ordens', async () => {
    prisma.ordemServico.findMany.mockResolvedValue([
      osEm('Dourados', 'MS', 300, 'FINALIZADO', 1),
      osEm('Dourados', 'MS', 100, 'FINALIZADO', 2),
    ]);

    const [linha] = await relatorio.porRegiao();
    expect(linha.ticketMedio).toBe(200);
  });
});
