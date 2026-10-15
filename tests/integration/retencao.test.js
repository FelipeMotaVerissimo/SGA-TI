require('../helpers/ambiente'); // precisa vir antes de src/app

const request = require('supertest');
const app     = require('../../src/app');
const { semear, logar, prisma } = require('../helpers/fixture');
const retencao = require('../../src/services/retencaoService');
const { aguardarGravacoes } = require('../../src/services/auditoriaExtensao');

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

/**
 * RN06 — a eliminação alcança o log de auditoria.
 *
 * Antes desta regra, a anonimização apagava os dados do cadastro mas eles
 * sobreviviam em `logs_auditoria.valorAnterior`: o pedido do titular era
 * atendido só na aparência.
 */
describe('anonimização alcança o log de auditoria', () => {
  /** Os dados pessoais do cliente da massa, como estavam antes. */
  const DADOS_ORIGINAIS = ['Cliente de Teste', '111.222.333-44', 'cliente@teste.com'];

  /** O log inteiro, de todas as entidades, como texto. */
  const logInteiro = async () => {
    await aguardarGravacoes();
    return JSON.stringify(await prisma.logAuditoria.findMany());
  };

  test('antes de anonimizar, o log contém os dados pessoais — a premissa do teste', async () => {
    // Uma alteração qualquer, para o log ter um estado anterior com os dados.
    const agente = await logar(request, app, 'atendente');
    await agente.post(`/clientes/${dados.cliente.id}/editar`).type('form').send({
      nome: 'Cliente de Teste', cpfCnpj: '111.222.333-44',
      email: 'cliente@teste.com', telefone: '67 3333-4444',
    });

    const log = await logInteiro();
    expect(log).toContain('cliente@teste.com');
    expect(log).toContain('111.222.333-44');
  });

  test('depois de anonimizar, nenhum dado pessoal sobra em lugar nenhum do log', async () => {
    const atendente = await logar(request, app, 'atendente');
    await atendente.post(`/clientes/${dados.cliente.id}/editar`).type('form').send({
      nome: 'Cliente de Teste', cpfCnpj: '111.222.333-44',
      email: 'cliente@teste.com', telefone: '67 3333-4444',
    });

    const admin = await logar(request, app, 'admin');
    await admin.post(`/clientes/${dados.cliente.id}/anonimizar`).type('form').send({});

    // A busca é no log INTEIRO, não só nos registros do cliente: se algum dado
    // tivesse vazado para outra entidade, apareceria aqui.
    const log = await logInteiro();
    for (const dado of [...DADOS_ORIGINAIS, '67 3333-4444']) {
      expect(log).not.toContain(dado);
    }
  });

  test('o log é redigido, não apagado — a rastreabilidade continua', async () => {
    const atendente = await logar(request, app, 'atendente');
    await atendente.post(`/clientes/${dados.cliente.id}/editar`).type('form').send({
      nome: 'Cliente de Teste', cpfCnpj: '111.222.333-44', telefone: '67 3333-4444',
    });
    await aguardarGravacoes();
    const antes = await prisma.logAuditoria.count({
      where: { entidade: 'Cliente', registroId: dados.cliente.id },
    });

    const admin = await logar(request, app, 'admin');
    await admin.post(`/clientes/${dados.cliente.id}/anonimizar`).type('form').send({});
    await aguardarGravacoes();

    const registros = await prisma.logAuditoria.findMany({
      where:   { entidade: 'Cliente', registroId: dados.cliente.id },
      orderBy: { id: 'asc' },
    });

    // Nenhum registro sumiu; o da anonimização entrou a mais.
    expect(registros.length).toBe(antes + 1);

    // Continua visível QUEM alterou e QUE campos mudaram.
    const alteracao = registros.find((r) => r.usuarioId === dados.usuarios.atendente.id);
    expect(alteracao).toBeDefined();
    const valor = JSON.parse(alteracao.valorNovo);
    expect(valor.telefone).toBe(retencao.MARCA_NO_LOG);  // o campo está lá...
    expect(valor.nome).toBe(retencao.MARCA_NO_LOG);      // ...o valor, não

    // E o registro da própria anonimização, com o administrador como autor.
    const daAnonimizacao = registros[registros.length - 1];
    expect(daAnonimizacao.usuarioId).toBe(dados.usuarios.admin.id);
    expect(JSON.parse(daAnonimizacao.valorNovo).anonimizadoEm).toBeDefined();
  });

  test('cidade e estado continuam no log, como no cadastro', async () => {
    const admin = await logar(request, app, 'admin');
    await admin.post(`/clientes/${dados.cliente.id}/anonimizar`).type('form').send({});
    await aguardarGravacoes();

    const daAnonimizacao = await prisma.logAuditoria.findFirst({
      where:   { entidade: 'Cliente', registroId: dados.cliente.id, acao: 'ALTERACAO' },
      orderBy: { id: 'desc' },
    });
    const anterior = JSON.parse(daAnonimizacao.valorAnterior);

    expect(anterior.cidade).toBe('Dourados');
    expect(anterior.estado).toBe('MS');
  });

  test('o log de OUTRO cliente não é tocado', async () => {
    const outro = await prisma.cliente.create({
      data: { nome: 'Outro Cliente Preservado', cpfCnpj: '999.888.777-66', email: 'outro@teste.com' },
    });
    await aguardarGravacoes();

    const admin = await logar(request, app, 'admin');
    await admin.post(`/clientes/${dados.cliente.id}/anonimizar`).type('form').send({});

    const log = await logInteiro();
    expect(log).toContain('Outro Cliente Preservado');
    expect(log).toContain('outro@teste.com');
    expect(log).toContain(String(outro.id));
  });
});

/**
 * RN07 — o dado que o sistema COPIOU para fora do cadastro.
 *
 * O faturamento gera a conta a receber com a descrição "OS <número> — <nome>".
 * A primeira versão da anonimização não olhava ali: a lista de contas mostrava
 * "Cliente anonimizado" na coluna do cliente e o nome completo na descrição.
 * Foi achado numa captura de tela do manual, não por teste — o teste anterior
 * passava porque a conta da massa não tinha o nome na descrição. Estes casos
 * cobrem o caminho real: faturar, depois anonimizar.
 */
describe('anonimização alcança o que o faturamento copiou', () => {
  const NOME = 'Cliente de Teste';

  /** Fatura a OS em andamento pela rota real, gerando a conta com o nome. */
  async function faturarOrdemDoCliente() {
    const admin = await logar(request, app, 'admin');
    await admin.post(`/ordens/${dados.ordens.andamento.id}/faturar`).type('form').send({});
    await aguardarGravacoes();
    return prisma.contaReceber.findUnique({ where: { ordemId: dados.ordens.andamento.id } });
  }

  test('a premissa: faturar copia o nome do cliente para a descrição da conta', async () => {
    const conta = await faturarOrdemDoCliente();

    expect(conta).not.toBeNull();
    expect(conta.descricao).toContain(NOME);
  });

  test('depois de anonimizar, a descrição da conta não tem mais o nome', async () => {
    const conta = await faturarOrdemDoCliente();

    const admin = await logar(request, app, 'admin');
    await admin.post(`/clientes/${dados.cliente.id}/anonimizar`).type('form').send({});

    const depois = await prisma.contaReceber.findUnique({ where: { id: conta.id } });
    expect(depois.descricao).not.toContain(NOME);
    expect(depois.descricao).toBe(`OS ${dados.ordens.andamento.numero} — ${retencao.NOME_ANONIMO}`);

    // O resto da conta é histórico fiscal e fica intacto.
    expect(Number(depois.valor)).toBe(Number(conta.valor));
    expect(depois.ordemId).toBe(conta.ordemId);
  });

  test('e o log da conta também não tem mais o nome', async () => {
    await faturarOrdemDoCliente();

    const admin = await logar(request, app, 'admin');
    await admin.post(`/clientes/${dados.cliente.id}/anonimizar`).type('form').send({});
    await aguardarGravacoes();

    // Procura no log INTEIRO — inclusive o registro da criação da conta, que
    // guardou a descrição com o nome no valorNovo.
    const log = JSON.stringify(await prisma.logAuditoria.findMany());
    expect(log).not.toContain(NOME);
    expect(log).not.toContain('111.222.333-44');
    expect(log).not.toContain('cliente@teste.com');
  });

  test('conta lançada à mão, sem OS, só perde o dado pessoal — o resto do texto fica', async () => {
    const manual = await prisma.contaReceber.create({
      data: {
        descricao: `Contrato mensal de ${NOME} — outubro`,
        valor: 150, vencimento: new Date(), clienteId: dados.cliente.id,
      },
    });

    const admin = await logar(request, app, 'admin');
    await admin.post(`/clientes/${dados.cliente.id}/anonimizar`).type('form').send({});

    const depois = await prisma.contaReceber.findUnique({ where: { id: manual.id } });
    expect(depois.descricao).toBe(`Contrato mensal de ${retencao.NOME_ANONIMO} — outubro`);
  });
});

/**
 * Reparo de anonimizações feitas antes do RN06 e do RN07.
 *
 * Um cliente anonimizado pela versão antiga já teve o cadastro sobrescrito, e
 * o nome original só existe no log — justamente o que precisa ser limpo.
 */
describe('reparo de anonimizações antigas', () => {
  /** Simula a anonimização da versão antiga: só o cadastro, nada mais. */
  async function anonimizarComoAntes() {
    const admin = await logar(request, app, 'admin');
    await admin.post(`/ordens/${dados.ordens.andamento.id}/faturar`).type('form').send({});
    await aguardarGravacoes();

    await prisma.cliente.update({
      where: { id: dados.cliente.id },
      data: {
        nome: retencao.NOME_ANONIMO, cpfCnpj: retencao.documentoAnonimo(dados.cliente.id),
        email: null, ativo: false, anonimizadoEm: new Date(),
      },
    });
    await aguardarGravacoes();
  }

  test('a premissa: a versão antiga deixava o nome na conta e no log', async () => {
    await anonimizarComoAntes();

    const conta = await prisma.contaReceber.findUnique({ where: { ordemId: dados.ordens.andamento.id } });
    expect(conta.descricao).toContain('Cliente de Teste');
    expect(JSON.stringify(await prisma.logAuditoria.findMany())).toContain('Cliente de Teste');
  });

  test('o reparo recupera o nome pelo log e limpa conta e log', async () => {
    await anonimizarComoAntes();

    const resumo = await retencao.repararAnonimizacao(dados.cliente.id);

    expect(resumo.contasRedigidas).toBe(1);
    const conta = await prisma.contaReceber.findUnique({ where: { ordemId: dados.ordens.andamento.id } });
    expect(conta.descricao).not.toContain('Cliente de Teste');

    await aguardarGravacoes();
    const log = JSON.stringify(await prisma.logAuditoria.findMany());
    expect(log).not.toContain('Cliente de Teste');
    expect(log).not.toContain('cliente@teste.com');
  });

  test('é idempotente: a segunda passada não muda nada', async () => {
    await anonimizarComoAntes();
    await retencao.repararAnonimizacao(dados.cliente.id);

    const segunda = await retencao.repararAnonimizacao(dados.cliente.id);

    expect(segunda).toEqual({ contasRedigidas: 0, logClienteRedigidos: 0, logContasRedigidos: 0 });
  });

  test('cliente que não foi anonimizado é recusado', async () => {
    await expect(retencao.repararAnonimizacao(dados.cliente.id))
      .rejects.toThrow(/não foi anonimizado/);
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
