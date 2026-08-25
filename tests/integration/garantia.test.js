require('../helpers/ambiente'); // precisa vir antes de src/app

const request = require('supertest');
const app     = require('../../src/app');
const { semear, logar, prisma } = require('../helpers/fixture');

/**
 * Módulo 3 parte 2 — Serviços Executados e Garantia.
 *
 * A garantia não é persistida: é derivada de executadoEm + garantiaDias. Isso
 * só se prova de ponta a ponta, olhando o que a tela mostra — inclusive na
 * consulta pública, que é o que o cliente vê.
 */

let dados;

beforeEach(async () => { dados = await semear(); });
afterAll(async () => { await prisma.$disconnect(); });

describe('registro de serviço executado', () => {
  test('registrar numa OS AUTORIZADO move o status para EM_ANDAMENTO (RN02)', async () => {
    const agente = await logar(request, app, 'tecnico');

    await agente.post(`/ordens/${dados.ordens.autorizado.id}/servicos`).type('form')
      .send({ descricao: 'Troca da placa-mãe e teste', garantiaDias: '90' });

    const ordem = await prisma.ordemServico.findUnique({ where: { id: dados.ordens.autorizado.id } });
    expect(ordem.status).toBe('EM_ANDAMENTO');
    expect(await prisma.servicoExecutado.count({ where: { ordemId: ordem.id } })).toBe(1);
  });

  test.each([
    ['INICIAL',    'inicial'],
    ['ORCAMENTO',  'orcamento'],
    ['FINALIZADO', 'finalizado'],
    ['CANCELADO',  'cancelado'],
  ])('OS %s não aceita registro de serviço (RN01)', async (_status, chave) => {
    const agente = await logar(request, app, 'tecnico');
    const antes  = await prisma.servicoExecutado.count();

    await agente.post(`/ordens/${dados.ordens[chave].id}/servicos`).type('form')
      .send({ descricao: 'Tentativa indevida de registro', garantiaDias: '30' });

    expect(await prisma.servicoExecutado.count()).toBe(antes);
  });

  test('descrição curta e garantia fora da faixa são recusadas (RN03/RN04)', async () => {
    const agente = await logar(request, app, 'tecnico');
    const antes  = await prisma.servicoExecutado.count();

    for (const corpo of [
      { descricao: 'abc' },                                          // curta demais
      { descricao: 'Servico valido de teste', garantiaDias: '-5' },  // negativa
      { descricao: 'Servico valido de teste', garantiaDias: '9999' },// acima do limite
    ]) {
      await agente.post(`/ordens/${dados.ordens.andamento.id}/servicos`).type('form').send(corpo);
    }

    expect(await prisma.servicoExecutado.count()).toBe(antes);
  });

  test('garantia 0 é gravada como sem garantia (RN04)', async () => {
    const agente = await logar(request, app, 'tecnico');

    await agente.post(`/ordens/${dados.ordens.andamento.id}/servicos`).type('form')
      .send({ descricao: 'Servico com garantia zero', garantiaDias: '0' });

    const servico = await prisma.servicoExecutado.findFirst({
      where: { descricao: 'Servico com garantia zero' },
    });
    expect(servico.garantiaDias).toBeNull();
  });
});

describe('situação da garantia na tela', () => {
  test('a OS mostra as três situações lado a lado', async () => {
    const agente = await logar(request, app, 'tecnico');
    const r = await agente.get(`/ordens/${dados.ordens.andamento.id}`);

    expect(r.text).toContain('Servico com garantia vigente');
    expect(r.text).toContain('Servico com garantia vencida');
    expect(r.text).toContain('Sem garantia');
    expect(r.text).toContain('Vencida');
  });

  test('a data-fim não é persistida — vem derivada de executadoEm', async () => {
    const servico = await prisma.servicoExecutado.findUnique({
      where: { id: dados.servicos.emGarantia.id },
    });

    expect(servico).not.toHaveProperty('garantiaAte');
    expect(servico).not.toHaveProperty('dataFimGarantia');
    expect(servico.garantiaDias).toBe(90);
  });
});

describe('exclusão de serviço', () => {
  test('não é possível excluir por uma OS que não é a dona (RN08)', async () => {
    const agente = await logar(request, app, 'tecnico');

    await agente
      .post(`/ordens/${dados.ordens.autorizado.id}/servicos/${dados.servicos.emGarantia.id}/excluir`)
      .type('form').send({});

    const ainda = await prisma.servicoExecutado.findUnique({
      where: { id: dados.servicos.emGarantia.id },
    });
    expect(ainda).not.toBeNull();
  });

  test('OS FINALIZADO não permite excluir serviço (RN07)', async () => {
    const servico = await prisma.servicoExecutado.create({
      data: { ordemId: dados.ordens.finalizado.id, descricao: 'Servico de OS encerrada', garantiaDias: 30 },
    });

    const agente = await logar(request, app, 'tecnico');
    await agente.post(`/ordens/${dados.ordens.finalizado.id}/servicos/${servico.id}/excluir`)
      .type('form').send({});

    expect(await prisma.servicoExecutado.findUnique({ where: { id: servico.id } })).not.toBeNull();
  });
});

describe('consulta pública (o que o cliente vê)', () => {
  test('sem login, o cliente vê status, serviços e garantia', async () => {
    const r = await request(app).post('/consulta').type('form')
      .send({ numero: dados.ordens.andamento.numero });

    expect(r.status).toBe(200);
    expect(r.text).toContain('EM ANDAMENTO');
    expect(r.text).toContain('Serviços Executados');
    expect(r.text).toContain('Em garantia até');
  });

  test('número inexistente não quebra a tela', async () => {
    const r = await request(app).post('/consulta').type('form').send({ numero: 'OS-NAO-EXISTE' });

    expect(r.status).toBe(200);
    expect(r.text).toContain('não encontrada');
  });
});
