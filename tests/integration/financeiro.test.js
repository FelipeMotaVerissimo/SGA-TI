require('../helpers/ambiente'); // precisa vir antes de src/app

const request = require('supertest');
const app     = require('../../src/app');
const { semear, logar, prisma } = require('../helpers/fixture');

/**
 * Módulo 4 — Controle Financeiro (RF020 / RF021).
 *
 * O caso central é o encerramento da OS: o status e a conta a receber precisam
 * ser gravados juntos. É a regra que sustenta a decisão D2 do projeto.
 */

let dados;

beforeEach(async () => { dados = await semear(); });
afterAll(async () => { await prisma.$disconnect(); });

/** Encerra a OS pela rota de faturamento, que exige perfil de gerência. */
async function faturar(ordemId) {
  const gerencia = await logar(request, app, 'admin');
  return gerencia.post(`/ordens/${ordemId}/faturar`).type('form').send({});
}

describe('liberação de faturamento (entrevista, item 8)', () => {
  test('o técnico não encerra a OS pelo seletor de status', async () => {
    const tecnico = await logar(request, app, 'tecnico');

    const r = await tecnico.post(`/ordens/${dados.ordens.andamento.id}/status`)
      .type('form').send({ status: 'FINALIZADO' });

    const tela = await tecnico.get(r.headers.location);
    expect(tela.text).toContain('depende de liberação da gerência');

    const ordem = await prisma.ordemServico.findUnique({ where: { id: dados.ordens.andamento.id } });
    expect(ordem.status).toBe('EM_ANDAMENTO');
    expect(await prisma.contaReceber.count({ where: { ordemId: ordem.id } })).toBe(0);
  });

  test('o técnico não acessa a rota de faturamento', async () => {
    const tecnico = await logar(request, app, 'tecnico');

    const r = await tecnico.post(`/ordens/${dados.ordens.andamento.id}/faturar`).type('form').send({});

    expect(r.headers.location).toBe('/dashboard');
    expect(await prisma.contaReceber.count({ where: { ordemId: dados.ordens.andamento.id } })).toBe(0);
  });

  test('o técnico continua mudando os demais status', async () => {
    const tecnico = await logar(request, app, 'tecnico');

    await tecnico.post(`/ordens/${dados.ordens.autorizado.id}/status`)
      .type('form').send({ status: 'EM_ANDAMENTO' });

    const ordem = await prisma.ordemServico.findUnique({ where: { id: dados.ordens.autorizado.id } });
    expect(ordem.status).toBe('EM_ANDAMENTO');
  });
});

describe('conta a receber gerada no faturamento da OS', () => {
  test('faturar cria a conta com o valor do orçamento', async () => {
    const ordem = dados.ordens.andamento;

    await faturar(ordem.id);

    const conta = await prisma.contaReceber.findUnique({ where: { ordemId: ordem.id } });
    expect(conta).not.toBeNull();
    expect(Number(conta.valor)).toBe(890);      // valor do orçamento
    expect(conta.situacao).toBe('ABERTA');
    expect(conta.clienteId).toBe(dados.cliente.id);
    expect(conta.descricao).toContain(ordem.numero);

    const atualizada = await prisma.ordemServico.findUnique({ where: { id: ordem.id } });
    expect(atualizada.status).toBe('FINALIZADO');
    expect(atualizada.dataFechamento).toBeInstanceOf(Date);
  });

  test('o orçamento prevalece sobre a soma das peças — nada é cobrado duas vezes', async () => {
    const vendedor = await logar(request, app, 'vendedor');
    await vendedor.post(`/ordens/${dados.ordens.andamento.id}/itens`).type('form')
      .send({ produtoId: String(dados.produtos.normal.id), quantidade: '2' }); // R$ 200 em peças

    await faturar(dados.ordens.andamento.id);

    const conta = await prisma.contaReceber.findUnique({
      where: { ordemId: dados.ordens.andamento.id },
    });

    expect(Number(conta.valor)).toBe(890);            // e não 890 + 200
    expect(conta.observacoes).toContain('Peças lançadas');
  });

  test('faturar duas vezes não duplica a conta', async () => {
    const id = dados.ordens.andamento.id;

    await faturar(id);
    await faturar(id);

    expect(await prisma.contaReceber.count({ where: { ordemId: id } })).toBe(1);
  });

  test('mudar para outro status não gera conta', async () => {
    const tecnico = await logar(request, app, 'tecnico');

    await tecnico.post(`/ordens/${dados.ordens.autorizado.id}/status`).type('form')
      .send({ status: 'EM_ANDAMENTO' });

    expect(await prisma.contaReceber.count({ where: { ordemId: dados.ordens.autorizado.id } })).toBe(0);
  });

  test('OS sem orçamento e sem peças não gera conta', async () => {
    await faturar(dados.ordens.inicial.id);

    expect(await prisma.contaReceber.count({ where: { ordemId: dados.ordens.inicial.id } })).toBe(0);
  });
});

describe('ciclo de vida das contas', () => {
  test('quitar registra situação, data e quem deu a baixa', async () => {
    const agente = await logar(request, app, 'financeiro');

    await agente.post(`/financeiro/pagar/${dados.contas.pagarAberta.id}/quitar`).type('form').send({});

    const conta = await prisma.contaPagar.findUnique({
      where: { id: dados.contas.pagarAberta.id },
      include: { quitadaPor: true },
    });

    expect(conta.situacao).toBe('PAGA');
    expect(conta.quitadaEm).toBeInstanceOf(Date);
    expect(conta.quitadaPor.login).toBe('financeiro');
  });

  test('conta já paga não pode ser quitada de novo', async () => {
    const agente = await logar(request, app, 'financeiro');
    const id = dados.contas.pagarAberta.id;

    await agente.post(`/financeiro/pagar/${id}/quitar`).type('form').send({});
    const antes = await prisma.contaPagar.findUnique({ where: { id } });

    const r = await agente.post(`/financeiro/pagar/${id}/quitar`).type('form').send({});
    const painel = await agente.get(r.headers.location);
    expect(painel.text).toContain('Só é possível quitar uma conta ABERTA');

    const depois = await prisma.contaPagar.findUnique({ where: { id } });
    expect(depois.quitadaEm).toEqual(antes.quitadaEm);
  });

  test('cancelar preserva a conta no histórico', async () => {
    const agente = await logar(request, app, 'financeiro');

    await agente.post(`/financeiro/receber/${dados.contas.receberAberta.id}/cancelar`).type('form').send({});

    const conta = await prisma.contaReceber.findUnique({ where: { id: dados.contas.receberAberta.id } });
    expect(conta).not.toBeNull();
    expect(conta.situacao).toBe('CANCELADA');
  });

  test('conta ABERTA pode ser editada', async () => {
    const agente = await logar(request, app, 'financeiro');

    await agente.post(`/financeiro/pagar/${dados.contas.pagarAberta.id}/editar`).type('form').send({
      descricao: 'Conta revisada', valor: '1190,00',
      vencimento: '2026-12-20', fornecedor: 'Outro Fornecedor',
    });

    const conta = await prisma.contaPagar.findUnique({ where: { id: dados.contas.pagarAberta.id } });
    expect(conta.descricao).toBe('Conta revisada');
    expect(Number(conta.valor)).toBe(1190);
  });

  test('conta PAGA não pode ser editada', async () => {
    const agente = await logar(request, app, 'financeiro');
    const id = dados.contas.pagarAberta.id;

    await agente.post(`/financeiro/pagar/${id}/quitar`).type('form').send({});
    await agente.post(`/financeiro/pagar/${id}/editar`).type('form').send({
      descricao: 'Tentativa indevida', valor: '1', vencimento: '2026-12-20',
    });

    const conta = await prisma.contaPagar.findUnique({ where: { id } });
    expect(conta.descricao).not.toBe('Tentativa indevida');
  });

  test('validações do cadastro de conta', async () => {
    const agente = await logar(request, app, 'financeiro');
    const antes  = await prisma.contaPagar.count();

    for (const corpo of [
      { descricao: 'ab',           valor: '100', vencimento: '2026-12-01' }, // curta
      { descricao: 'Conta válida', valor: '',    vencimento: '2026-12-01' }, // sem valor
      { descricao: 'Conta válida', valor: '0',   vencimento: '2026-12-01' }, // zero
      { descricao: 'Conta válida', valor: '100', vencimento: '' },           // sem vencimento
    ]) {
      await agente.post('/financeiro/pagar').type('form').send(corpo);
    }

    expect(await prisma.contaPagar.count()).toBe(antes);
  });

  test('vencimento não perde um dia por causa do fuso', async () => {
    const agente = await logar(request, app, 'financeiro');

    await agente.post('/financeiro/pagar').type('form').send({
      descricao: 'Conta com vencimento exato', valor: '100', vencimento: '2026-12-01',
    });

    const conta = await prisma.contaPagar.findFirst({
      where: { descricao: 'Conta com vencimento exato' },
    });

    expect(conta.vencimento.getDate()).toBe(1);
    expect(conta.vencimento.getMonth()).toBe(11); // dezembro
  });
});
