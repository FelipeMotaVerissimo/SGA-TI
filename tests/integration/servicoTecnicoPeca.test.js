require('../helpers/ambiente'); // precisa vir antes de src/app

const request = require('supertest');
const app     = require('../../src/app');
const { semear, logar, saldo, prisma } = require('../helpers/fixture');
const { aguardarGravacoes } = require('../../src/services/auditoriaExtensao');

/**
 * Backlog item 2 — quem executou cada serviço e em qual serviço cada peça foi
 * usada, com sessão, telas e banco de verdade.
 *
 * | Regra | O que se prova aqui |
 * |---|---|
 * | RN09 | O técnico gravado é o usuário logado, mesmo com outro id forjado no corpo |
 * | RN10 | A peça pode ser lançada com ou sem serviço, e aparece sob ele na OS |
 * | RN11 | Serviço de outra OS é recusado: nenhum item, estoque parado |
 * | RN12 | Excluir o serviço deixa as peças na OS, desvinculadas e auditadas |
 */

let dados;

beforeEach(async () => { dados = await semear(); });
afterAll(async () => { await prisma.$disconnect(); });

const OS = () => dados.ordens.andamento;

/** Último serviço registrado na OS em andamento. */
const ultimoServico = () =>
  prisma.servicoExecutado.findFirst({ where: { ordemId: OS().id }, orderBy: { id: 'desc' } });

async function registrarServico(agente, extra = {}) {
  await agente.post(`/ordens/${OS().id}/servicos`).type('form')
    .send({ descricao: 'Troca do conector de carga', ...extra });
  return ultimoServico();
}

async function lancarPeca(agente, servicoId, ordemId = OS().id) {
  return agente.post(`/ordens/${ordemId}/itens`).type('form')
    .send({ produtoId: dados.produtos.normal.id, quantidade: '1', servicoId });
}

describe('RN09 — técnico do serviço', () => {
  test('o técnico gravado é o usuário logado, e a OS mostra o nome dele', async () => {
    const tecnico = await logar(request, app, 'tecnico');
    const servico = await registrarServico(tecnico);

    expect(servico.usuarioId).toBe(dados.usuarios.tecnico.id);

    const tela = await tecnico.get(`/ordens/${OS().id}`);
    expect(tela.text).toContain('Usuario tecnico');
  });

  test('usuarioId forjado no formulário é ignorado', async () => {
    const tecnico = await logar(request, app, 'tecnico');
    const servico = await registrarServico(tecnico, { usuarioId: String(dados.usuarios.admin.id) });

    expect(servico.usuarioId).toBe(dados.usuarios.tecnico.id);
  });

  test('serviço anterior ao registro do técnico aparece como "não registrado"', async () => {
    const tecnico = await logar(request, app, 'tecnico');
    const tela = await tecnico.get(`/ordens/${OS().id}`);

    // Os serviços da fixture foram criados sem usuarioId, como os antigos.
    expect(tela.text).toMatch(/não registrado/);
  });

  test('o histórico do equipamento (RF012) mostra o técnico', async () => {
    const tecnico = await logar(request, app, 'tecnico');
    await registrarServico(tecnico);

    const tela = await tecnico.get(`/equipamentos/${dados.equipamento.id}/historico`);
    expect(tela.status).toBe(200);
    expect(tela.text).toContain('<th>Técnico</th>');
    expect(tela.text).toContain('Usuario tecnico');
    expect(tela.text).toMatch(/não registrado/);
  });

  test('a consulta pública NÃO mostra o nome do técnico', async () => {
    const tecnico = await logar(request, app, 'tecnico');
    await registrarServico(tecnico);

    const r = await request(app).post('/consulta').type('form').send({ numero: OS().numero });
    expect(r.status).toBe(200);
    expect(r.text).toContain('Troca do conector de carga');   // o serviço aparece...
    expect(r.text).not.toContain('Usuario tecnico');          // ...quem fez, não
  });
});

describe('RN10/RN11 — peça usada no serviço', () => {
  test('a tela de lançamento oferece só os serviços da própria OS', async () => {
    const vendedor = await logar(request, app, 'vendedor');
    const tela = await vendedor.get(`/ordens/${OS().id}`);

    expect(tela.text).toContain('name="servicoId"');
    const opcoes = [...tela.text.matchAll(/<select name="servicoId">([\s\S]*?)<\/select>/g)][0][1];
    const ids = [...opcoes.matchAll(/value="(\d+)"/g)].map((m) => Number(m[1])).sort();
    const daOS = Object.values(dados.servicos).map((s) => s.id).sort();
    expect(ids).toEqual(daOS);
  });

  test('peça vinculada: grava o vínculo e aparece sob o serviço', async () => {
    const vendedor = await logar(request, app, 'vendedor');
    const servico = dados.servicos.semGarantia;

    await lancarPeca(vendedor, String(servico.id));

    const item = await prisma.itemOrdem.findFirst({ where: { ordemId: OS().id } });
    expect(item.servicoId).toBe(servico.id);

    const tela = await vendedor.get(`/ordens/${OS().id}`);
    expect(tela.text).toContain(`Peças: ${dados.produtos.normal.nome} ×1`);
  });

  test('peça sem serviço: uso geral da OS', async () => {
    const vendedor = await logar(request, app, 'vendedor');
    await lancarPeca(vendedor, '');

    const item = await prisma.itemOrdem.findFirst({ where: { ordemId: OS().id } });
    expect(item.servicoId).toBeNull();

    const tela = await vendedor.get(`/ordens/${OS().id}`);
    expect(tela.text).toMatch(/uso geral da OS/);
  });

  test('serviço de OUTRA OS: recusado, nenhum item criado e estoque parado', async () => {
    const vendedor = await logar(request, app, 'vendedor');
    const servicoAlheio = await prisma.servicoExecutado.create({
      data: { ordemId: dados.ordens.autorizado.id, descricao: 'Servico de outra OS' },
    });
    const saldoAntes = await saldo(dados.produtos.normal.id);

    await lancarPeca(vendedor, String(servicoAlheio.id));
    const tela = await vendedor.get(`/ordens/${OS().id}`);

    expect(tela.text).toMatch(/não pertence a esta ordem de serviço/);
    expect(await prisma.itemOrdem.count({ where: { ordemId: OS().id } })).toBe(0);
    expect(await saldo(dados.produtos.normal.id)).toBe(saldoAntes);
  });
});

describe('RN12 — excluir serviço com peças vinculadas', () => {
  test('as peças ficam na OS, desvinculadas; estoque parado; auditoria de cada uma', async () => {
    const vendedor = await logar(request, app, 'vendedor');
    const servico = dados.servicos.semGarantia;
    await lancarPeca(vendedor, String(servico.id));
    await lancarPeca(vendedor, String(servico.id));
    const saldoAntes = await saldo(dados.produtos.normal.id);
    const itens = await prisma.itemOrdem.findMany({ where: { ordemId: OS().id } });
    expect(itens).toHaveLength(2);

    const tecnico = await logar(request, app, 'tecnico');
    await tecnico.post(`/ordens/${OS().id}/servicos/${servico.id}/excluir`).type('form').send({});
    const tela = await tecnico.get(`/ordens/${OS().id}`);
    await aguardarGravacoes();

    expect(await prisma.servicoExecutado.findUnique({ where: { id: servico.id } })).toBeNull();
    const depois = await prisma.itemOrdem.findMany({ where: { ordemId: OS().id } });
    expect(depois).toHaveLength(2);
    expect(depois.every((i) => i.servicoId === null)).toBe(true);
    expect(await saldo(dados.produtos.normal.id)).toBe(saldoAntes);
    expect(tela.text).toMatch(/2 peça\(s\) desvinculada\(s\)/);

    const logs = await prisma.logAuditoria.findMany({
      where: { entidade: 'ItemOrdem', acao: 'ALTERACAO', registroId: { in: itens.map((i) => i.id) } },
    });
    expect(logs).toHaveLength(2);
    for (const log of logs) {
      expect(JSON.parse(log.valorAnterior).servicoId).toBe(servico.id);
      expect(log.usuarioId).toBe(dados.usuarios.tecnico.id);
    }
  });

  test('o banco recusa excluir serviço com peça vinculada por fora da regra', async () => {
    // RESTRICT: se algum caminho esquecer de desvincular, falha — não apaga
    // o vínculo calado.
    const vendedor = await logar(request, app, 'vendedor');
    const servico = dados.servicos.semGarantia;
    await lancarPeca(vendedor, String(servico.id));

    await expect(prisma.servicoExecutado.delete({ where: { id: servico.id } })).rejects.toThrow();
    expect(await prisma.servicoExecutado.findUnique({ where: { id: servico.id } })).not.toBeNull();
  });
});
