require('../helpers/ambiente'); // precisa vir antes de src/app

const request = require('supertest');
const app     = require('../../src/app');
const { semear, logar, prisma } = require('../helpers/fixture');

/**
 * Módulo 5 — catálogo de tipos de serviço e classificação.
 *
 * O catálogo existe só para dar granularidade ao RF017. O que precisa ser
 * provado é o ciclo completo: cadastrar o tipo, escolher no registro do
 * serviço, e o relatório agrupar por ele.
 */

let dados;

beforeEach(async () => { dados = await semear(); });
afterAll(async () => { await prisma.$disconnect(); });

const texto = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('acesso ao catálogo', () => {
  test('é configuração: só perfil gerencial entra', async () => {
    for (const login of ['tecnico', 'atendente', 'vendedor', 'compras', 'financeiro']) {
      const agente = await logar(request, app, login);
      const r = await agente.get('/tipos-servico');
      expect(r.headers.location).toBe('/dashboard');
    }

    const admin = await logar(request, app, 'admin');
    expect((await admin.get('/tipos-servico')).status).toBe(200);
  });
});

describe('cadastro', () => {
  test('cria um tipo novo', async () => {
    const agente = await logar(request, app, 'admin');

    await agente.post('/tipos-servico').type('form').send({ nome: 'Formatação' });

    const tipo = await prisma.tipoServico.findFirst({ where: { nome: 'Formatação' } });
    expect(tipo).not.toBeNull();
    expect(tipo.ativo).toBe(true);
  });

  test('nome duplicado é recusado e o texto volta no formulário', async () => {
    const agente = await logar(request, app, 'admin');

    const r = await agente.post('/tipos-servico').type('form')
      .send({ nome: dados.tiposServico.tela.nome });

    expect(r.text).toContain('Já existe um tipo');
    expect(r.text).toContain(`value="${dados.tiposServico.tela.nome}"`);
    expect(await prisma.tipoServico.count({ where: { nome: dados.tiposServico.tela.nome } })).toBe(1);
  });

  test('nome curto demais é recusado', async () => {
    const agente = await logar(request, app, 'admin');
    const antes  = await prisma.tipoServico.count();

    const r = await agente.post('/tipos-servico').type('form').send({ nome: 'ab' });

    expect(r.text).toContain('pelo menos 3 caracteres');
    expect(await prisma.tipoServico.count()).toBe(antes);
  });

  test('a listagem mostra quantos serviços usam cada tipo', async () => {
    const agente = await logar(request, app, 'admin');
    const conteudo = texto((await agente.get('/tipos-servico')).text);

    // a fixture registrou 2 serviços com "Troca de tela" e 1 com "Limpeza interna"
    expect(conteudo).toContain('Troca de tela');
    expect(conteudo).toContain('Limpeza interna');
  });
});

describe('desativação', () => {
  test('é lógica: o tipo some da escolha mas o histórico fica', async () => {
    const agente = await logar(request, app, 'admin');
    const id = dados.tiposServico.tela.id;

    await agente.post(`/tipos-servico/${id}/desativar`).type('form').send({});

    const tipo = await prisma.tipoServico.findUnique({ where: { id } });
    expect(tipo).not.toBeNull();
    expect(tipo.ativo).toBe(false);

    // os serviços que já usavam o tipo continuam apontando para ele
    const usos = await prisma.servicoExecutado.count({ where: { tipoServicoId: id } });
    expect(usos).toBe(2);
  });

  test('tipo inativo não aparece na lista de escolha da OS', async () => {
    const tecnico = await logar(request, app, 'tecnico');
    const r = await tecnico.get(`/ordens/${dados.ordens.andamento.id}`);

    expect(r.text).toContain(dados.tiposServico.tela.nome);
    expect(r.text).not.toContain(dados.tiposServico.inativo.nome);
  });
});

describe('classificação do serviço executado', () => {
  test('o técnico escolhe o tipo ao registrar', async () => {
    const tecnico = await logar(request, app, 'tecnico');

    await tecnico.post(`/ordens/${dados.ordens.andamento.id}/servicos`).type('form').send({
      descricao: 'Troca da tela do notebook',
      tipoServicoId: String(dados.tiposServico.tela.id),
      garantiaDias: '90',
    });

    const servico = await prisma.servicoExecutado.findFirst({
      where: { descricao: 'Troca da tela do notebook' },
    });
    expect(servico.tipoServicoId).toBe(dados.tiposServico.tela.id);
  });

  test('o tipo é opcional — sem ele o serviço grava mesmo assim', async () => {
    const tecnico = await logar(request, app, 'tecnico');

    await tecnico.post(`/ordens/${dados.ordens.andamento.id}/servicos`).type('form')
      .send({ descricao: 'Servico sem tipo escolhido', tipoServicoId: '' });

    const servico = await prisma.servicoExecutado.findFirst({
      where: { descricao: 'Servico sem tipo escolhido' },
    });
    expect(servico).not.toBeNull();
    expect(servico.tipoServicoId).toBeNull();
  });

  test('a OS mostra o tipo de cada serviço', async () => {
    const tecnico = await logar(request, app, 'tecnico');
    const conteudo = texto((await tecnico.get(`/ordens/${dados.ordens.andamento.id}`)).text);

    expect(conteudo).toContain('Troca de tela');
    expect(conteudo).toContain('não classificado');  // o serviço sem tipo da fixture
  });
});

describe('RF017 — serviços mais executados', () => {
  test('agrupa por tipo, e não pela descrição livre', async () => {
    const agente = await logar(request, app, 'admin');

    // período explícito de 60 dias: a fixture tem um serviço com 30 dias, que
    // fica fora da janela padrão e tornaria o teste dependente do calendário
    const hoje = new Date();
    const inicio = new Date(hoje);
    inicio.setDate(inicio.getDate() - 60);
    const iso = (d) => d.toISOString().slice(0, 10);

    const r = await agente.get(`/relatorios?de=${iso(inicio)}&ate=${iso(hoje)}`);
    const conteudo = texto(r.text);

    // dois serviços com descrições diferentes e o mesmo tipo viram uma linha
    const linha = conteudo.match(/Troca de tela\s+(\d+)/);
    expect(linha).not.toBeNull();
    expect(Number(linha[1])).toBe(2);
  });

  test('serviço sem tipo aparece como Não classificado', async () => {
    const agente = await logar(request, app, 'admin');
    const conteudo = texto((await agente.get('/relatorios')).text);

    expect(conteudo).toContain('Não classificado');
  });

  test('conta quantos do grupo têm garantia', async () => {
    const agente = await logar(request, app, 'admin');
    const r = await agente.get('/relatorios');

    // "Troca de tela" tem 2 serviços, ambos com garantia (90 e 7 dias)
    expect(r.text).toContain('Serviços Mais Executados');
    expect(texto(r.text)).toContain('Com Garantia');
  });
});

describe('RF019 — por tipo de equipamento', () => {
  test('agrupa serviços e peças pelo tipo do equipamento', async () => {
    const vendedor = await logar(request, app, 'vendedor');
    await vendedor.post(`/ordens/${dados.ordens.andamento.id}/itens`).type('form')
      .send({ produtoId: String(dados.produtos.normal.id), quantidade: '2' });

    const admin = await logar(request, app, 'admin');
    const conteudo = texto((await admin.get('/relatorios')).text);

    // o equipamento da fixture é NOTEBOOK
    expect(conteudo).toContain('NOTEBOOK');
    expect(conteudo).toContain('R$ 200.00');
  });

  test('equipamento sem classificação aparece como OUTRO', async () => {
    await prisma.equipamento.updateMany({ data: { tipo: 'OUTRO' } });

    const admin = await logar(request, app, 'admin');
    const conteudo = texto((await admin.get('/relatorios')).text);

    expect(conteudo).toContain('OUTRO');
  });
});

describe('classificação do equipamento', () => {
  test('o tipo é gravado no cadastro', async () => {
    const agente = await logar(request, app, 'atendente');

    await agente.post('/equipamentos').type('form').send({
      clienteId: String(dados.cliente.id),
      tipo: 'IMPRESSORA', marca: 'HP', modelo: 'LaserJet',
      defeito: 'Não puxa papel',
    });

    const equipamento = await prisma.equipamento.findFirst({ where: { modelo: 'LaserJet' } });
    expect(equipamento.tipo).toBe('IMPRESSORA');
  });

  test('sem tipo informado, assume OUTRO em vez de recusar o cadastro', async () => {
    const agente = await logar(request, app, 'atendente');

    await agente.post('/equipamentos').type('form').send({
      clienteId: String(dados.cliente.id),
      marca: 'Genérica', modelo: 'Sem tipo', defeito: 'Defeito qualquer',
    });

    const equipamento = await prisma.equipamento.findFirst({ where: { modelo: 'Sem tipo' } });
    expect(equipamento.tipo).toBe('OUTRO');
  });

  test('tipo inventado é recusado', async () => {
    const agente = await logar(request, app, 'atendente');

    const r = await agente.post('/equipamentos').type('form').send({
      clienteId: String(dados.cliente.id),
      tipo: 'GELADEIRA', marca: 'Brastemp', modelo: 'Frost Free', defeito: 'Não gela',
    });

    expect(r.text).toContain('Tipo de equipamento inválido');
    expect(await prisma.equipamento.count({ where: { modelo: 'Frost Free' } })).toBe(0);
  });
});
