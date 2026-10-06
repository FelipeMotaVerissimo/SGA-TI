require('../helpers/ambiente'); // precisa vir antes de src/app

const request = require('supertest');
const app     = require('../../src/app');
const { semear, logar, dias, prisma } = require('../helpers/fixture');

/**
 * RF012 — histórico de serviços por equipamento.
 *
 * Era a pendência P07 dos Módulos 3 e 4: o histórico existia, mas só dentro de
 * cada OS. Aqui se prova que a tela reúne os serviços das várias ordens numa
 * lista só, com a garantia derivada na hora.
 */

let dados;
const url = (id) => `/equipamentos/${id}/historico`;

beforeEach(async () => { dados = await semear(); });
afterAll(async () => { await prisma.$disconnect(); });

describe('tela do histórico', () => {
  test('reúne os serviços de todas as OS do equipamento', async () => {
    const agente = await logar(request, app, 'atendente');
    const res    = await agente.get(url(dados.equipamento.id));

    expect(res.status).toBe(200);

    // Os quatro serviços da massa estão na OS em andamento; todos têm que
    // aparecer na tela do equipamento, sem precisar abrir a OS.
    for (const s of Object.values(dados.servicos)) {
      expect(res.text).toContain(s.descricao);
    }

    // E a OS de origem vai junto em cada linha.
    expect(res.text).toContain(dados.ordens.andamento.numero);
  });

  test('identifica o equipamento e o cliente', async () => {
    const agente = await logar(request, app, 'atendente');
    const res    = await agente.get(url(dados.equipamento.id));

    expect(res.text).toContain(dados.equipamento.codigo);
    expect(res.text).toContain(dados.equipamento.marca);
    expect(res.text).toContain(dados.cliente.nome);
  });

  test('a situação da garantia é derivada, não lida do banco (RN03)', async () => {
    const agente = await logar(request, app, 'atendente');
    const res    = await agente.get(url(dados.equipamento.id));

    // A massa tem um serviço de 90 dias executado há 10: faltam 80.
    expect(res.text).toMatch(/80 dia\(s\)/);
    // E um de 7 dias executado há 30, que já venceu.
    expect(res.text).toContain('Vencida');
  });

  test('RN02: serviço de OS CANCELADO continua aparecendo', async () => {
    // Registrado pelo banco de propósito: a rota recusa registro em OS
    // cancelada (RN01 do Módulo 3). O caso real é o serviço ter sido feito
    // enquanto a OS estava aberta e a OS ser cancelada depois.
    await prisma.servicoExecutado.create({
      data: {
        ordemId: dados.ordens.cancelado.id,
        descricao: 'Diagnostico feito antes do cancelamento',
        executadoEm: dias(-1),
      },
    });

    const agente = await logar(request, app, 'atendente');
    const res    = await agente.get(url(dados.equipamento.id));

    expect(res.text).toContain('Diagnostico feito antes do cancelamento');
    expect(res.text).toContain(dados.ordens.cancelado.numero);
  });

  test('equipamento sem serviço mostra a tela vazia, não quebra', async () => {
    const equipamentoNovo = await prisma.equipamento.create({
      data: {
        codigo: 'EQ-SEM-HISTORICO', tipo: 'CELULAR', marca: 'Motorola',
        modelo: 'Moto G', defeito: 'Tela trincada', clienteId: dados.cliente.id,
      },
    });

    const agente = await logar(request, app, 'atendente');
    const res    = await agente.get(url(equipamentoNovo.id));

    expect(res.status).toBe(200);
    expect(res.text).toContain('Nenhum serviço executado registrado');
  });

  test('equipamento inexistente não quebra a tela', async () => {
    const agente = await logar(request, app, 'atendente');
    const res    = await agente.get(url(999999));

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/equipamentos');
  });
});

describe('acesso por perfil (RF023)', () => {
  test.each(['atendente', 'tecnico', 'admin'])('%s consulta o histórico', async (login) => {
    const agente = await logar(request, app, login);
    const res    = await agente.get(url(dados.equipamento.id));

    expect(res.status).toBe(200);
  });

  test.each(['vendedor', 'financeiro', 'compras'])('%s não acessa', async (login) => {
    const agente = await logar(request, app, login);
    const res    = await agente.get(url(dados.equipamento.id));

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/dashboard');
  });

  test('sem sessão, vai para o login', async () => {
    const res = await request(app).get(url(dados.equipamento.id));

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });

  test('o técnico, que não vê a lista de equipamentos, volta para as ordens', async () => {
    const agente = await logar(request, app, 'tecnico');
    const res    = await agente.get(url(dados.equipamento.id));

    // Sem isso o "voltar" mandaria o técnico para /equipamentos, que é do
    // ATENDENTE, e ele levaria um "acesso negado" na cara.
    expect(res.text).toContain('Voltar para ordens de serviço');
  });
});
