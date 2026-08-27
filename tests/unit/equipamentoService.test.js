jest.mock('../../src/config/database', () => ({
  equipamento:  { findUnique: jest.fn() },
  ordemServico: { findMany: jest.fn() },
}));

const prisma      = require('../../src/config/database');
const equipamento = require('../../src/services/equipamentoService');

const dias = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
};

const EQUIPAMENTO = {
  id: 1, codigo: 'EQ-1', tipo: 'NOTEBOOK', marca: 'Dell', modelo: 'Inspiron',
  numeroSerie: 'ABC123', defeito: 'Não liga', cliente: { id: 1, nome: 'Marcos' },
};

/** OS com os serviços já pendurados, como o Prisma devolve com o include. */
const os = (numero, status, servicos = []) => ({
  id: Number(numero.slice(-1)), numero, status,
  defeitoRelatado: 'Defeito de teste', dataAbertura: dias(-30), servicos,
});

const servico = (descricao, executadoEm, garantiaDias = null, tipoServico = null) => ({
  id: Math.floor(Math.random() * 1e6),
  descricao, executadoEm, garantiaDias, tipoServico, observacoes: null,
});

describe('equipamentoService.historicoDeServicos (RF012)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.equipamento.findUnique.mockResolvedValue(EQUIPAMENTO);
  });

  test('equipamento inexistente devolve 404', async () => {
    prisma.equipamento.findUnique.mockResolvedValue(null);

    await expect(equipamento.historicoDeServicos(99)).rejects.toMatchObject({
      status: 404,
      message: 'Equipamento não encontrado.',
    });
  });

  test('RN01: ordena por data de execução, atravessando as OS', async () => {
    // De propósito fora de ordem e espalhados em OS diferentes: o histórico do
    // equipamento é cronológico, não agrupado por ordem de serviço.
    prisma.ordemServico.findMany.mockResolvedValue([
      os('OS-2', 'FINALIZADO', [
        servico('Troca de tela', dias(-40)),
        servico('Limpeza interna', dias(-2)),
      ]),
      os('OS-1', 'EM_ANDAMENTO', [servico('Troca de teclado', dias(-15))]),
    ]);

    const { servicos } = await equipamento.historicoDeServicos(1);

    expect(servicos.map((s) => s.descricao)).toEqual([
      'Limpeza interna',   // -2
      'Troca de teclado',  // -15
      'Troca de tela',     // -40
    ]);
  });

  test('RN02: serviço de OS CANCELADO continua no histórico, com o status junto', async () => {
    prisma.ordemServico.findMany.mockResolvedValue([
      os('OS-1', 'CANCELADO', [servico('Diagnóstico executado', dias(-5))]),
    ]);

    const { servicos, resumo } = await equipamento.historicoDeServicos(1);

    expect(resumo.totalServicos).toBe(1);
    expect(servicos[0].ordem).toMatchObject({ numero: 'OS-1', status: 'CANCELADO' });
  });

  test('RN03: a garantia é derivada, não lida do banco', async () => {
    prisma.ordemServico.findMany.mockResolvedValue([
      os('OS-1', 'FINALIZADO', [
        servico('Serviço em garantia', dias(-10), 90),
        servico('Serviço com garantia vencida', dias(-40), 7),
        servico('Serviço sem garantia', dias(-3), null),
      ]),
    ]);

    const { servicos, resumo } = await equipamento.historicoDeServicos(1);
    const porDescricao = Object.fromEntries(servicos.map((s) => [s.descricao, s.garantia]));

    expect(porDescricao['Serviço em garantia'].situacao).toBe('EM_GARANTIA');
    expect(porDescricao['Serviço em garantia'].diasRestantes).toBe(80); // 90 - 10
    expect(porDescricao['Serviço com garantia vencida'].situacao).toBe('VENCIDA');
    expect(porDescricao['Serviço sem garantia'].situacao).toBe('SEM_GARANTIA');

    // Só o vigente entra na contagem do resumo.
    expect(resumo.emGarantia).toBe(1);
  });

  test('o resumo conta OS e serviços, e aponta o último atendimento', async () => {
    const maisRecente = dias(-2);
    prisma.ordemServico.findMany.mockResolvedValue([
      os('OS-1', 'FINALIZADO', [servico('Serviço antigo', dias(-30))]),
      os('OS-2', 'EM_ANDAMENTO', [servico('Serviço recente', maisRecente)]),
      os('OS-3', 'INICIAL', []), // OS sem serviço conta como OS, não como serviço
    ]);

    const { resumo } = await equipamento.historicoDeServicos(1);

    expect(resumo.totalOrdens).toBe(3);
    expect(resumo.totalServicos).toBe(2);
    expect(resumo.ultimoAtendimento).toEqual(maisRecente);
  });

  test('equipamento sem nenhuma OS devolve histórico vazio, não erro', async () => {
    prisma.ordemServico.findMany.mockResolvedValue([]);

    const { servicos, ordens, resumo } = await equipamento.historicoDeServicos(1);

    expect(ordens).toEqual([]);
    expect(servicos).toEqual([]);
    expect(resumo).toMatchObject({
      totalOrdens: 0, totalServicos: 0, emGarantia: 0, ultimoAtendimento: null,
    });
  });

  test('busca as OS pelo equipamento informado, não todas', async () => {
    prisma.ordemServico.findMany.mockResolvedValue([]);

    await equipamento.historicoDeServicos('7');

    expect(prisma.ordemServico.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { equipamentoId: EQUIPAMENTO.id } })
    );
  });
});

describe('equipamentoService.validarTipo', () => {
  test('sem tipo informado, cai no padrão OUTRO', () => {
    expect(equipamento.validarTipo('')).toBe('OUTRO');
    expect(equipamento.validarTipo(undefined)).toBe(equipamento.TIPO_PADRAO);
  });

  test('normaliza para maiúsculo e aceita os tipos do catálogo', () => {
    expect(equipamento.validarTipo('notebook')).toBe('NOTEBOOK');
    expect(equipamento.validarTipo('  celular ')).toBe('CELULAR');
  });

  test('tipo fora da lista é recusado com 400', () => {
    expect(() => equipamento.validarTipo('GELADEIRA')).toThrow(/Tipo de equipamento inválido/);
  });
});
