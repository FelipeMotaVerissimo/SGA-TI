require('../helpers/ambiente'); // precisa vir antes de src/app

const request = require('supertest');
const app     = require('../../src/app');
const { semear, logar, prisma } = require('../helpers/fixture');
const { aguardarGravacoes } = require('../../src/services/auditoriaExtensao');

/**
 * NF005 — rastreabilidade.
 *
 * O que precisa ficar provado de ponta a ponta:
 *  1. o log é gravado sozinho, pela operação normal do sistema, sem nenhum
 *     controller chamar função de auditoria;
 *  2. ele registra QUEM fez, a partir da sessão;
 *  3. a tela é só do administrador;
 *  4. não existe caminho para alterar ou apagar um registro.
 */

let dados;

beforeEach(async () => { dados = await semear(); });
afterAll(async () => { await prisma.$disconnect(); });

/**
 * A gravação do log é disparada sem `await` de propósito (senão trava dentro de
 * $transaction), então conferir o resultado exige esperar as gravações em voo.
 */
const logsDe = async (entidade) => {
  await aguardarGravacoes();
  return prisma.logAuditoria.findMany({ where: { entidade }, orderBy: { criadoEm: 'desc' } });
};

describe('gravação automática', () => {
  test('cadastrar um cliente pela tela gera INCLUSAO, sem o controller pedir', async () => {
    const agente = await logar(request, app, 'atendente');
    await prisma.logAuditoria.deleteMany();

    await agente.post('/clientes/novo').type('form').send({
      nome: 'Cliente Auditado', cpfCnpj: '999.888.777-66', cidade: 'Dourados', estado: 'MS',
    });

    const logs = await logsDe('Cliente');
    expect(logs).toHaveLength(1);
    expect(logs[0].acao).toBe('INCLUSAO');
    expect(logs[0].usuarioId).toBe(dados.usuarios.atendente.id);
    expect(JSON.parse(logs[0].valorNovo).nome).toBe('Cliente Auditado');
  });

  test('editar um cliente gera ALTERACAO com o antes e o depois', async () => {
    const cliente = await prisma.cliente.create({
      data: { nome: 'Nome Antigo', cpfCnpj: '123.123.123-12' },
    });

    const agente = await logar(request, app, 'atendente');
    await prisma.logAuditoria.deleteMany();

    await agente.post(`/clientes/${cliente.id}/editar`).type('form').send({
      nome: 'Nome Novo', cpfCnpj: '123.123.123-12',
    });

    const logs = await logsDe('Cliente');
    expect(logs[0].acao).toBe('ALTERACAO');
    expect(JSON.parse(logs[0].valorAnterior).nome).toBe('Nome Antigo');
    expect(JSON.parse(logs[0].valorNovo).nome).toBe('Nome Novo');
  });

  test('registrar serviço na OS audita o serviço e a mudança de status da OS', async () => {
    const agente = await logar(request, app, 'tecnico');
    await prisma.logAuditoria.deleteMany();

    // RN02 do Módulo 3: a OS AUTORIZADO passa para EM_ANDAMENTO, em transação.
    await agente.post(`/ordens/${dados.ordens.autorizado.id}/servicos`).type('form')
      .send({ descricao: 'Troca da placa-mae e teste', garantiaDias: '90' });

    const servico = await logsDe('ServicoExecutado');
    const ordem   = await logsDe('OrdemServico');

    expect(servico[0].acao).toBe('INCLUSAO');
    expect(servico[0].usuarioId).toBe(dados.usuarios.tecnico.id);

    // A operação dentro da transação também é auditada.
    expect(ordem[0].acao).toBe('ALTERACAO');
    expect(JSON.parse(ordem[0].valorNovo).status).toBe('EM_ANDAMENTO');
  });

  test('operação pela API registra o usuário do token, não da sessão', async () => {
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { id: dados.usuarios.compras.id, perfil: 'COMPRAS' },
      process.env.JWT_SECRET, { expiresIn: '1h' }
    );
    await prisma.logAuditoria.deleteMany();

    await request(app).post('/api/produtos')
      .set('Authorization', `Bearer ${token}`)
      .send({ nome: 'Peca via API', preco: 50, estoque: 3 });

    const logs = await logsDe('Produto');
    expect(logs[0].acao).toBe('INCLUSAO');
    expect(logs[0].usuarioId).toBe(dados.usuarios.compras.id);
  });

  test('a senha nunca aparece no log, nem ao criar usuário', async () => {
    const agente = await logar(request, app, 'admin');
    await prisma.logAuditoria.deleteMany();

    await agente.post('/usuarios').type('form').send({
      nome: 'Novo Usuario', login: 'novo_usuario_log',
      senha: 'SENHA-EM-TEXTO-PURO', perfilId: dados.perfis.TECNICO.id,
    });

    await aguardarGravacoes();
    const todos = await prisma.logAuditoria.findMany();
    expect(JSON.stringify(todos)).not.toContain('SENHA-EM-TEXTO-PURO');

    const logUsuario = todos.find((l) => l.entidade === 'Usuario');
    if (logUsuario && logUsuario.valorNovo) {
      expect(JSON.parse(logUsuario.valorNovo).senha).toBe('[omitido]');
    }
  });

  test('o log não se audita: consultar a auditoria não gera registro novo', async () => {
    const agente = await logar(request, app, 'admin');
    await prisma.logAuditoria.deleteMany();

    await agente.get('/auditoria');
    await aguardarGravacoes();

    expect(await prisma.logAuditoria.count()).toBe(0);
  });
});

describe('tela de auditoria — acesso (RF023)', () => {
  test('ADMINISTRADOR abre a tela', async () => {
    const agente = await logar(request, app, 'admin');
    const res    = await agente.get('/auditoria');

    expect(res.status).toBe(200);
    expect(res.text).toContain('Auditoria');
  });

  test.each(['atendente', 'tecnico', 'vendedor', 'financeiro', 'compras'])(
    '%s não acessa a auditoria',
    async (login) => {
      const agente = await logar(request, app, login);
      const res    = await agente.get('/auditoria');

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/dashboard');
    }
  );

  test('sem sessão, vai para o login', async () => {
    const res = await request(app).get('/auditoria');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });
});

describe('tela de auditoria — somente leitura', () => {
  test.each([
    ['post',   '/auditoria'],
    ['post',   '/auditoria/1/excluir'],
    ['delete', '/auditoria/1'],
    ['put',    '/auditoria/1'],
  ])('%s %s não existe — não há caminho para alterar o log', async (metodo, rota) => {
    const agente = await logar(request, app, 'admin');
    const antes  = await prisma.logAuditoria.count();

    const res = await agente[metodo](rota).type('form').send({ acao: 'EXCLUSAO' });
    await aguardarGravacoes();

    expect(res.status).toBe(404);
    expect(await prisma.logAuditoria.count()).toBe(antes);
  });
});

describe('tela de auditoria — filtros', () => {
  /** Gera um log de cada tipo, de usuários diferentes. */
  async function semearLogs() {
    await prisma.logAuditoria.deleteMany();
    const base = { entidade: 'Cliente', acao: 'INCLUSAO', registroId: 1 };
    await prisma.logAuditoria.createMany({
      data: [
        { ...base, usuarioId: dados.usuarios.atendente.id },
        { ...base, acao: 'ALTERACAO', usuarioId: dados.usuarios.atendente.id },
        { ...base, entidade: 'Produto', usuarioId: dados.usuarios.compras.id },
      ],
    });
  }

  test('filtro por entidade', async () => {
    await semearLogs();
    const agente = await logar(request, app, 'admin');

    const res = await agente.get('/auditoria?entidade=Produto');

    expect(res.status).toBe(200);
    expect(res.text).toContain('Produto');
  });

  test('filtro por usuário devolve só os registros dele', async () => {
    await semearLogs();
    const agente = await logar(request, app, 'admin');

    const res = await agente.get(`/auditoria?usuarioId=${dados.usuarios.compras.id}`);

    expect(res.status).toBe(200);
    // O select de filtro lista todos os usuários que aparecem no log, então
    // procurar o nome na página inteira não prova nada. O que prova é o total:
    // dos 3 registros semeados, só 1 é do compras.
    expect(res.text).toMatch(/<div class="card-valor">1<\/div>\s*<div class="card-label">Registros no período<\/div>/);
  });

  test('filtro por ação', async () => {
    await semearLogs();
    const agente = await logar(request, app, 'admin');

    const res = await agente.get('/auditoria?acao=ALTERACAO');

    expect(res.status).toBe(200);
  });

  test('período invertido não quebra a tela — volta com aviso', async () => {
    const agente = await logar(request, app, 'admin');

    const res = await agente.get('/auditoria?de=2026-12-31&ate=2026-01-01');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/dashboard');
  });

  test('período que não cobre nada devolve a tela vazia, não erro', async () => {
    await semearLogs();
    const agente = await logar(request, app, 'admin');

    const res = await agente.get('/auditoria?de=2020-01-01&ate=2020-01-31');

    expect(res.status).toBe(200);
    expect(res.text).toContain('Nenhuma operação registrada');
  });
});
