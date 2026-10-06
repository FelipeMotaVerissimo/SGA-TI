require('../helpers/ambiente'); // precisa vir antes de src/app

const request = require('supertest');
const app     = require('../../src/app');
const { semear, logar, prisma } = require('../helpers/fixture');
const retencao = require('../../src/services/retencaoService');

/**
 * NF008 — retenção e descarte.
 *
 * O ponto central do requisito é o conflito: o titular pode exigir a eliminação
 * dos seus dados (art. 18 da LGPD), mas a assistência não pode apagar o
 * histórico de ordens de serviço. A prova que interessa é que **os dados
 * pessoais somem e o histórico fica**.
 */

let dados;

beforeEach(async () => { dados = await semear(); });
afterAll(async () => { await prisma.$disconnect(); });

const buscarCliente = (id) => prisma.cliente.findUnique({ where: { id } });

describe('anonimização de cliente (art. 18 da LGPD)', () => {
  test('apaga os dados pessoais e preserva o histórico', async () => {
    const id = dados.cliente.id;

    // Antes: o cliente tem OS, equipamento e conta a receber.
    const antes = await retencao.resumoDoVinculo(id);
    expect(antes.ordens).toBeGreaterThan(0);
    expect(antes.equipamentos).toBeGreaterThan(0);

    const agente = await logar(request, app, 'admin');
    await agente.post(`/clientes/${id}/anonimizar`).type('form').send({});

    const cliente = await buscarCliente(id);

    // Dados pessoais: apagados.
    expect(cliente.nome).toBe(retencao.NOME_ANONIMO);
    expect(cliente.cpfCnpj).toBe(retencao.documentoAnonimo(id));
    for (const campo of retencao.CAMPOS_ANONIMIZADOS) {
      expect(cliente[campo]).toBeNull();
    }
    expect(cliente.anonimizadoEm).not.toBeNull();
    expect(cliente.ativo).toBe(false); // RN04

    // Histórico: intacto.
    const depois = await retencao.resumoDoVinculo(id);
    expect(depois).toEqual(antes);
  });

  test('o e-mail e o telefone do cliente somem mesmo do banco', async () => {
    const id = dados.cliente.id;
    const original = await buscarCliente(id);
    expect(original.email).toBe('cliente@teste.com'); // a massa tem e-mail

    const agente = await logar(request, app, 'admin');
    await agente.post(`/clientes/${id}/anonimizar`).type('form').send({});

    const cliente = await buscarCliente(id);
    expect(JSON.stringify(cliente)).not.toContain('cliente@teste.com');
    expect(JSON.stringify(cliente)).not.toContain('111.222.333-44'); // cpf da massa
  });

  test('cidade e estado permanecem — decisão consciente, sustentam o NF004', async () => {
    const id = dados.cliente.id;
    const agente = await logar(request, app, 'admin');
    await agente.post(`/clientes/${id}/anonimizar`).type('form').send({});

    const cliente = await buscarCliente(id);
    expect(cliente.cidade).toBe('Dourados');
    expect(cliente.estado).toBe('MS');
  });

  test('as ordens de serviço continuam consultáveis depois da anonimização', async () => {
    const id = dados.cliente.id;
    const agente = await logar(request, app, 'admin');
    await agente.post(`/clientes/${id}/anonimizar`).type('form').send({});

    const os = await prisma.ordemServico.findUnique({
      where:   { id: dados.ordens.finalizado.id },
      include: { equipamento: { include: { cliente: true } } },
    });

    expect(os).not.toBeNull();
    expect(os.equipamento.cliente.id).toBe(id);
    expect(os.equipamento.cliente.nome).toBe(retencao.NOME_ANONIMO);
  });

  test('anonimizar duas vezes é recusado — a primeira data não se perde', async () => {
    const id = dados.cliente.id;
    const agente = await logar(request, app, 'admin');

    await agente.post(`/clientes/${id}/anonimizar`).type('form').send({});
    const primeira = (await buscarCliente(id)).anonimizadoEm;

    await agente.post(`/clientes/${id}/anonimizar`).type('form').send({});
    const segunda = (await buscarCliente(id)).anonimizadoEm;

    expect(segunda).toEqual(primeira);
  });

  test('dois clientes anonimizados não colidem no cpfCnpj único', async () => {
    const outro = await prisma.cliente.create({
      data: { nome: 'Segundo Cliente', cpfCnpj: '222.333.444-55' },
    });

    const agente = await logar(request, app, 'admin');
    await agente.post(`/clientes/${dados.cliente.id}/anonimizar`).type('form').send({});
    await agente.post(`/clientes/${outro.id}/anonimizar`).type('form').send({});

    const a = await buscarCliente(dados.cliente.id);
    const b = await buscarCliente(outro.id);

    expect(a.cpfCnpj).not.toBe(b.cpfCnpj);
    expect(a.anonimizadoEm).not.toBeNull();
    expect(b.anonimizadoEm).not.toBeNull();
  });

  test('cliente inexistente devolve mensagem, não quebra', async () => {
    await expect(retencao.anonimizarCliente(999999)).rejects.toMatchObject({ status: 404 });
  });

  test('a anonimização é auditada (NF005)', async () => {
    const agente = await logar(request, app, 'admin');
    await prisma.logAuditoria.deleteMany();

    await agente.post(`/clientes/${dados.cliente.id}/anonimizar`).type('form').send({});

    const { aguardarGravacoes } = require('../../src/services/auditoriaExtensao');
    await aguardarGravacoes();

    const log = await prisma.logAuditoria.findFirst({
      where: { entidade: 'Cliente', acao: 'ALTERACAO' },
    });
    expect(log).not.toBeNull();
    expect(log.usuarioId).toBe(dados.usuarios.admin.id);
    expect(JSON.parse(log.valorNovo).anonimizadoEm).toBeDefined();
  });
});

describe('anonimização — acesso (RF023)', () => {
  test.each(['atendente', 'tecnico', 'vendedor', 'financeiro', 'compras'])(
    '%s não pode anonimizar',
    async (login) => {
      const agente = await logar(request, app, login);

      const res = await agente.post(`/clientes/${dados.cliente.id}/anonimizar`).type('form').send({});

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/dashboard');
      expect((await buscarCliente(dados.cliente.id)).anonimizadoEm).toBeNull();
    }
  );

  test('sem sessão, nada acontece', async () => {
    const res = await request(app).post(`/clientes/${dados.cliente.id}/anonimizar`).type('form').send({});

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
    expect((await buscarCliente(dados.cliente.id)).anonimizadoEm).toBeNull();
  });
});

describe('exclusão lógica de equipamento', () => {
  const buscarEquip = (id) => prisma.equipamento.findUnique({ where: { id } });

  test('desativar não apaga o registro nem o histórico', async () => {
    const id = dados.equipamento.id;
    const ordensAntes = await prisma.ordemServico.count({ where: { equipamentoId: id } });

    const agente = await logar(request, app, 'admin');
    await agente.post(`/equipamentos/${id}/excluir`).type('form').send({});

    const equip = await buscarEquip(id);
    expect(equip).not.toBeNull();
    expect(equip.ativo).toBe(false);
    expect(await prisma.ordemServico.count({ where: { equipamentoId: id } })).toBe(ordensAntes);
  });

  test('equipamento inativo some da listagem padrão e volta com o filtro', async () => {
    const id = dados.equipamento.id;
    const agente = await logar(request, app, 'admin');
    await agente.post(`/equipamentos/${id}/excluir`).type('form').send({});

    const padrao = await agente.get('/equipamentos');
    expect(padrao.text).not.toContain(dados.equipamento.codigo);

    const comInativos = await agente.get('/equipamentos?inativos=1');
    expect(comInativos.text).toContain(dados.equipamento.codigo);
  });

  test('equipamento inativo não é oferecido para OS nova', async () => {
    const id = dados.equipamento.id;
    const agente = await logar(request, app, 'admin');
    await agente.post(`/equipamentos/${id}/excluir`).type('form').send({});

    const equipamentoService = require('../../src/services/equipamentoService');
    const disponiveis = await equipamentoService.buscarPorCliente(dados.cliente.id);

    expect(disponiveis.map((e) => e.id)).not.toContain(id);
  });

  test('reativar devolve o equipamento à lista', async () => {
    const id = dados.equipamento.id;
    const agente = await logar(request, app, 'admin');

    await agente.post(`/equipamentos/${id}/excluir`).type('form').send({});
    await agente.post(`/equipamentos/${id}/reativar`).type('form').send({});

    expect((await buscarEquip(id)).ativo).toBe(true);
  });

  test.each(['atendente', 'tecnico', 'vendedor'])('%s não desativa equipamento', async (login) => {
    const agente = await logar(request, app, login);

    const res = await agente.post(`/equipamentos/${dados.equipamento.id}/excluir`).type('form').send({});

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/dashboard');
    expect((await buscarEquip(dados.equipamento.id)).ativo).toBe(true);
  });
});
