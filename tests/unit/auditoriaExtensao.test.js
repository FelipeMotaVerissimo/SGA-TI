const extensao = require('../../src/services/auditoriaExtensao');
const contexto  = require('../../src/config/contextoRequisicao');

/**
 * NF005 — a extensão que grava a auditoria sozinha.
 *
 * Aqui não há banco: o cliente base é um dublê, e o que se verifica é o que a
 * extensão **manda gravar** para cada operação.
 */

/** Cliente base falso: guarda o que foi mandado para `logAuditoria.create`. */
function clienteFalso({ registroAnterior = null, falharAoGravar = false } = {}) {
  const gravados = [];
  return {
    gravados,
    logAuditoria: {
      create: jest.fn(async ({ data }) => {
        if (falharAoGravar) throw new Error('banco de log fora do ar');
        gravados.push(data);
        return data;
      }),
    },
    cliente:  { findUnique: jest.fn(async () => registroAnterior) },
    usuario:  { findUnique: jest.fn(async () => registroAnterior) },
  };
}

/** Executa a extensão como o Prisma executaria. */
async function executar(base, { model, operation, args, resultado = { id: 7 } }) {
  const ext = extensao.criarExtensao(base);
  const handler = ext.query.$allModels.$allOperations;
  const query = jest.fn(async () => resultado);
  const retorno = await handler({ model, operation, args, query });
  return { retorno, query };
}

describe('auditoriaExtensao.serializar', () => {
  test('omite a senha, mas deixa claro que o campo existia', () => {
    const json = extensao.serializar({ nome: 'Ana', senha: 'segredo123' });
    expect(JSON.parse(json)).toEqual({ nome: 'Ana', senha: '[omitido]' });
    expect(json).not.toContain('segredo123');
  });

  test('converte datas para texto comparável', () => {
    const data = new Date('2026-08-20T12:00:00.000Z');
    expect(JSON.parse(extensao.serializar({ criadoEm: data })).criadoEm)
      .toBe('2026-08-20T12:00:00.000Z');
  });

  test('valor ausente vira null, não quebra', () => {
    expect(extensao.serializar(null)).toBeNull();
    expect(extensao.serializar('texto solto')).toBeNull();
  });

  test('referência circular não derruba a gravação', () => {
    const circular = { nome: 'x' };
    circular.self = circular;
    expect(extensao.serializar(circular)).toBeNull();
  });
});

describe('auditoriaExtensao — registro automático', () => {
  test('create vira INCLUSAO, com o id devolvido pela operação', async () => {
    const base = clienteFalso();
    await executar(base, {
      model: 'Cliente', operation: 'create',
      args: { data: { nome: 'Ana' } }, resultado: { id: 42 },
    });

    expect(base.gravados).toHaveLength(1);
    expect(base.gravados[0]).toMatchObject({
      entidade: 'Cliente', acao: 'INCLUSAO', registroId: 42,
    });
    expect(JSON.parse(base.gravados[0].valorNovo)).toEqual({ nome: 'Ana' });
  });

  test('update vira ALTERACAO e guarda o estado anterior', async () => {
    const base = clienteFalso({ registroAnterior: { id: 7, nome: 'Antes' } });
    await executar(base, {
      model: 'Cliente', operation: 'update',
      args: { where: { id: 7 }, data: { nome: 'Depois' } },
    });

    const log = base.gravados[0];
    expect(log.acao).toBe('ALTERACAO');
    expect(log.registroId).toBe(7);
    expect(JSON.parse(log.valorAnterior)).toMatchObject({ nome: 'Antes' });
    expect(JSON.parse(log.valorNovo)).toEqual({ nome: 'Depois' });
  });

  test('delete vira EXCLUSAO e não inventa valor novo', async () => {
    const base = clienteFalso({ registroAnterior: { id: 7, nome: 'Some' } });
    await executar(base, {
      model: 'Cliente', operation: 'delete', args: { where: { id: 7 } },
    });

    const log = base.gravados[0];
    expect(log.acao).toBe('EXCLUSAO');
    expect(JSON.parse(log.valorAnterior)).toMatchObject({ nome: 'Some' });
    expect(log.valorNovo).toBeNull();
  });

  test('leitura não gera log — findMany passa direto', async () => {
    const base = clienteFalso();
    const { query } = await executar(base, {
      model: 'Cliente', operation: 'findMany', args: {},
    });

    expect(query).toHaveBeenCalled();
    expect(base.gravados).toHaveLength(0);
  });

  test('o próprio LogAuditoria não é auditado — sem recursão', async () => {
    const base = clienteFalso();
    await executar(base, {
      model: 'LogAuditoria', operation: 'create', args: { data: { entidade: 'X' } },
    });

    expect(base.gravados).toHaveLength(0);
    expect(base.logAuditoria.create).not.toHaveBeenCalled();
  });

  test('a senha nunca chega ao log, nem no valor novo', async () => {
    const base = clienteFalso({ registroAnterior: { id: 3, senha: 'hash-antigo' } });
    await executar(base, {
      model: 'Usuario', operation: 'update',
      args: { where: { id: 3 }, data: { senha: 'NOVA-SENHA-EM-TEXTO' } },
    });

    const log = JSON.stringify(base.gravados[0]);
    expect(log).not.toContain('NOVA-SENHA-EM-TEXTO');
    expect(log).not.toContain('hash-antigo');
    expect(JSON.parse(base.gravados[0].valorNovo).senha).toBe('[omitido]');
  });
});

describe('auditoriaExtensao — contexto da requisição', () => {
  test('fora de requisição, grava sem usuário e sem ip', async () => {
    const base = clienteFalso();
    await executar(base, { model: 'Cliente', operation: 'create', args: { data: {} } });

    expect(base.gravados[0].usuarioId).toBeNull();
    expect(base.gravados[0].ip).toBeNull();
  });

  test('dentro de requisição, carrega usuário e ip sem o service saber disso', async () => {
    const base = clienteFalso();

    await contexto.executarNoContexto({ usuarioId: 99, ip: '192.0.2.10' }, async () => {
      await executar(base, { model: 'Cliente', operation: 'create', args: { data: {} } });
    });

    expect(base.gravados[0]).toMatchObject({ usuarioId: 99, ip: '192.0.2.10' });
  });

  test('definirUsuario completa a identidade depois da autenticação', async () => {
    const base = clienteFalso();

    await contexto.executarNoContexto({ usuarioId: null, ip: '203.0.113.7' }, async () => {
      contexto.definirUsuario(55); // é o que o authMiddleware faz ao validar o JWT
      await executar(base, { model: 'Cliente', operation: 'create', args: { data: {} } });
    });

    expect(base.gravados[0].usuarioId).toBe(55);
  });
});

describe('auditoriaExtensao — robustez', () => {
  test('falha ao gravar o log NÃO derruba a operação de negócio', async () => {
    const base = clienteFalso({ falharAoGravar: true });

    const { retorno } = await executar(base, {
      model: 'Cliente', operation: 'create',
      args: { data: { nome: 'Ana' } }, resultado: { id: 1, nome: 'Ana' },
    });

    // A operação devolveu normalmente, apesar de o log ter explodido.
    expect(retorno).toEqual({ id: 1, nome: 'Ana' });
  });

  test('falha ao ler o estado anterior não impede o log', async () => {
    const base = clienteFalso();
    base.cliente.findUnique = jest.fn(async () => { throw new Error('where composto'); });

    await executar(base, {
      model: 'Cliente', operation: 'update',
      args: { where: { codigo: 'X' }, data: { nome: 'Y' } },
    });

    expect(base.gravados).toHaveLength(1);
    expect(base.gravados[0].valorAnterior).toBeNull();
    expect(base.gravados[0].acao).toBe('ALTERACAO');
  });
});
