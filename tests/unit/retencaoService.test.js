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

// --------------------------------------------------------------------------
// Módulo 6 — entregas (RN35 a RN38)
// --------------------------------------------------------------------------

describe('redigir com lista de campos (log das entregas)', () => {
  const logEntrega = JSON.stringify({
    status: 'ENTREGUE', destinoLat: '-22.221134', destinoLng: '-54.805612', motivo: null, ordemParada: 1,
  });

  test('troca a coordenada pela marca e mantém o resto', () => {
    const { texto, alterou } = retencao.redigir(logEntrega, { porCampo: retencao.CAMPOS_DE_LOCAL_DA_ENTREGA });
    expect(alterou).toBe(true);
    expect(JSON.parse(texto)).toEqual({
      status: 'ENTREGUE', destinoLat: MARCA_NO_LOG, destinoLng: MARCA_NO_LOG, motivo: null, ordemParada: 1,
    });
  });

  test('com a lista, os campos do cliente não são tocados — e vice-versa', () => {
    const misto = JSON.stringify({ nome: 'Joana Ribeiro', destinoLat: '-22.2' });
    expect(JSON.parse(retencao.redigir(misto, { porCampo: ['destinoLat'] }).texto))
      .toEqual({ nome: 'Joana Ribeiro', destinoLat: MARCA_NO_LOG });
    expect(JSON.parse(retencao.redigir(misto, { porCampo: true }).texto))
      .toEqual({ nome: MARCA_NO_LOG, destinoLat: '-22.2' });
  });

  test('coordenada nula fica nula; a segunda passada não muda nada', () => {
    const nulo = JSON.stringify({ destinoLat: null, destinoLng: null });
    expect(retencao.redigir(nulo, { porCampo: retencao.CAMPOS_DE_LOCAL_DA_ENTREGA }).alterou).toBe(false);
    const uma = retencao.redigir(logEntrega, { porCampo: retencao.CAMPOS_DE_LOCAL_DA_ENTREGA }).texto;
    expect(retencao.redigir(uma, { porCampo: retencao.CAMPOS_DE_LOCAL_DA_ENTREGA }).alterou).toBe(false);
  });

  test('o motivo com o nome é redigido pela busca em texto', () => {
    const comMotivo = JSON.stringify({ motivo: 'Joana Ribeiro Silva não estava' });
    const pares = retencao.paresDeSubstituicao({ nome: 'Joana Ribeiro Silva' });
    expect(JSON.parse(retencao.redigir(comMotivo, { porCampo: ['destinoLat'], pares }).texto).motivo)
      .toBe(`${NOME_ANONIMO} não estava`);
  });
});

describe('retenção do trajeto (RN35 e RN36)', () => {
  const prisma = require('../../src/config/database');
  const AGORA = new Date('2026-10-18T12:00:00Z');

  beforeEach(() => {
    prisma.posicaoEntrega = { deleteMany: jest.fn(async () => ({ count: 7 })) };
    prisma.entregaOS = {
      findMany:   jest.fn(async () => [{ id: 3 }, { id: 4 }]),
      updateMany: jest.fn(async () => ({ count: 2 })),
    };
  });

  test('o corte é 30 dias antes de agora', () => {
    expect(retencao.DIAS_RETENCAO_TRAJETO).toBe(30);
    expect(retencao.corteDoTrajeto(AGORA)).toEqual(new Date('2026-09-18T12:00:00Z'));
  });

  test('só saídas encerradas ou canceladas antes do corte; em rota nunca', async () => {
    const r = await retencao.limparTrajetosAntigos(AGORA);
    const filtro = { status: { in: ['CONCLUIDA', 'CANCELADA'] }, encerradaEm: { lt: new Date('2026-09-18T12:00:00Z') } };

    expect(prisma.posicaoEntrega.deleteMany).toHaveBeenCalledWith({ where: { saida: filtro } });
    expect(prisma.entregaOS.findMany.mock.calls[0][0].where.saida).toEqual(filtro);
    expect(r).toEqual({ corte: new Date('2026-09-18T12:00:00Z'), posicoesApagadas: 7, destinosAnulados: 2 });
  });

  test('anula a coordenada só das entregas que ainda têm uma', async () => {
    await retencao.limparTrajetosAntigos(AGORA);
    expect(prisma.entregaOS.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [3, 4] } },
      data:  { destinoLat: null, destinoLng: null },
    });
  });

  test('sem coordenada a anular, não faz o updateMany — que deixaria uma linha vazia no log', async () => {
    prisma.entregaOS.findMany.mockResolvedValue([]);
    const r = await retencao.limparTrajetosAntigos(AGORA);
    expect(prisma.entregaOS.updateMany).not.toHaveBeenCalled();
    expect(r.destinosAnulados).toBe(0);
  });
});

describe('anonimização com entrega pendente (RN38)', () => {
  const prisma = require('../../src/config/database');

  test('é recusada antes de tocar no cadastro', async () => {
    prisma.cliente = { findUnique: jest.fn(async () => ({ id: 9, anonimizadoEm: null })), update: jest.fn() };
    prisma.entregaOS = { count: jest.fn(async () => 1) };

    await expect(retencao.anonimizarCliente(9)).rejects.toMatchObject({
      status: 400, message: expect.stringMatching(/entrega em andamento/),
    });
    expect(prisma.entregaOS.count).toHaveBeenCalledWith({
      where: { status: 'PENDENTE', ordem: { equipamento: { clienteId: 9 } } },
    });
    expect(prisma.cliente.update).not.toHaveBeenCalled();
  });
});
