require('../helpers/ambiente'); // precisa vir antes de src/app

const request = require('supertest');
const app     = require('../../src/app');
const { semear, logar, prisma, dias } = require('../helpers/fixture');
const { aguardarGravacoes } = require('../../src/services/auditoriaExtensao');
const entregaService = require('../../src/services/entregaService');
const geocodificacao = require('../../src/services/geocodificacaoService');

/**
 * Módulo 6 — saída de entrega, ponta a ponta (regras RN15 a RN25).
 *
 * A geocodificação chama o Nominatim; aqui o `fetch` é sempre simulado — o CI
 * não pode depender de rede. O intervalo da fila é encurtado para 1 ms.
 */

let dados;
let fetchSimulado;

beforeEach(async () => {
  dados = await semear();
  geocodificacao._reiniciarFila({ intervalo: 1 });
  fetchSimulado = jest.spyOn(global, 'fetch').mockResolvedValue({
    ok: true, json: async () => [{ lat: '-22.221134', lon: '-54.805612' }],
  });
});
afterEach(async () => {
  await entregaService.aguardarGeocodificacoes();
  fetchSimulado.mockRestore();
});
afterAll(async () => { await prisma.$disconnect(); });

const FIN = () => dados.ordens.finalizado;

/** OS finalizada nova, de um cliente com endereço completo. */
async function osFinalizada(numero, fechadaHaDias = 1, cliente = null) {
  const c = cliente || await prisma.cliente.create({
    data: {
      nome: `Cliente ${numero}`, cpfCnpj: `${numero.slice(-6)}-CPF`,
      endereco: 'Rua Hayel Bon Faker', numero: '1200', bairro: 'Centro',
      cidade: 'Dourados', estado: 'MS', cep: '79800-000',
    },
  });
  const eq = await prisma.equipamento.create({
    data: { codigo: `EQ-${numero}`, tipo: 'NOTEBOOK', marca: 'Dell', modelo: 'X', defeito: 'Teste', clienteId: c.id },
  });
  return prisma.ordemServico.create({
    data: {
      numero, status: 'FINALIZADO', defeitoRelatado: 'Teste', equipamentoId: eq.id,
      usuarioId: dados.usuarios.atendente.id, dataFechamento: dias(-fechadaHaDias),
    },
  });
}

const iniciar = (agente, ids) =>
  agente.post('/entregas/saida').type('form').send({ ordemIds: ids.map(String) });

const ativa = () => prisma.saidaEntrega.findUnique({ where: { emRota: true }, include: { entregas: true } });

// --------------------------------------------------------------------------
describe('acesso por perfil', () => {
  test('o ENTREGADOR e o administrador abrem a tela de saída', async () => {
    for (const login of ['entregador', 'admin']) {
      const r = await (await logar(request, app, login)).get('/entregas/saida');
      expect(r.status).toBe(200);
      expect(r.text).toContain('Saída de entrega');
    }
  });

  test.each(['atendente', 'tecnico', 'vendedor', 'financeiro', 'compras'])(
    '%s não acessa as rotas de entrega', async (login) => {
      const agente = await logar(request, app, login);
      for (const [metodo, rota] of [
        ['get', '/entregas/saida'], ['post', '/entregas/saida'],
        ['post', '/entregas/saida/posicao'], ['post', '/entregas/saida/encerrar'],
        ['post', '/entregas/1/entregue'], ['post', '/entregas/1/nao-entregue'],
        ['post', '/entregas/saidas/1/cancelar'],
      ]) {
        const r = await agente[metodo](rota).send({});
        expect(r.headers.location).toBe('/dashboard');
      }
      expect(await prisma.saidaEntrega.count()).toBe(0);
    });

  test('o ENTREGADOR sai do login direto para a tela de entregas', async () => {
    const entregador = await logar(request, app, 'entregador');
    const r = await entregador.get('/dashboard');
    expect(r.headers.location).toBe('/entregas/saida');
  });

  test('RN25: o ENTREGADOR não cancela a saída', async () => {
    const entregador = await logar(request, app, 'entregador');
    await iniciar(entregador, [FIN().id]);
    const saida = await ativa();

    const r = await entregador.post(`/entregas/saidas/${saida.id}/cancelar`).send({});
    expect(r.headers.location).toBe('/dashboard');
    expect((await ativa()).status).toBe('EM_ROTA');
  });
});

// --------------------------------------------------------------------------
describe('iniciar saída', () => {
  test('a tela lista só OS finalizadas, sem entrega, faturadas nos últimos 30 dias', async () => {
    const antiga = await osFinalizada('OS-T-ANTIGA', 40);
    const entregador = await logar(request, app, 'entregador');
    const tela = await entregador.get('/entregas/saida');

    expect(tela.text).toContain(FIN().numero);
    expect(tela.text).not.toContain(dados.ordens.andamento.numero);
    expect(tela.text).not.toContain(antiga.numero);
  });

  test('cria a saída em rota, uma entrega por OS, com o entregador logado (RN18)', async () => {
    const outra = await osFinalizada('OS-T-101');
    const entregador = await logar(request, app, 'entregador');
    await iniciar(entregador, [outra.id, FIN().id]);

    const saida = await ativa();
    expect(saida.entregadorId).toBe(dados.usuarios.entregador.id);
    expect(saida.entregas.map((e) => [e.ordemId, e.ordemParada, e.ordemPendenteId]))
      .toEqual(expect.arrayContaining([[outra.id, 1, outra.id], [FIN().id, 2, FIN().id]]));
  });

  test('RN15: OS não finalizada recusa a saída inteira (tudo ou nada)', async () => {
    const entregador = await logar(request, app, 'entregador');
    await iniciar(entregador, [FIN().id, dados.ordens.andamento.id]);
    const tela = await entregador.get('/entregas/saida');

    expect(tela.text).toMatch(/não está finalizada/);
    expect(await prisma.saidaEntrega.count()).toBe(0);
    expect(await prisma.entregaOS.count()).toBe(0);
  });

  test('RN17: sem nenhuma OS a saída não inicia', async () => {
    const entregador = await logar(request, app, 'entregador');
    await entregador.post('/entregas/saida').type('form').send({});
    const tela = await entregador.get('/entregas/saida');

    expect(tela.text).toMatch(/Escolha ao menos uma OS/);
    expect(await prisma.saidaEntrega.count()).toBe(0);
  });

  test('RN13: com uma saída em rota, outra não inicia — e a mensagem é clara', async () => {
    const outra = await osFinalizada('OS-T-102');
    const entregador = await logar(request, app, 'entregador');
    await iniciar(entregador, [FIN().id]);

    // Pelo service, para ver o status e a mensagem; pela tela é o mesmo texto no flash.
    await expect(entregaService.iniciarSaida([outra.id], { id: dados.usuarios.admin.id, perfil: 'ADMINISTRADOR' }))
      .rejects.toMatchObject({ status: 409, message: expect.stringMatching(/Já existe uma saída em rota/) });
    expect(await prisma.saidaEntrega.count()).toBe(1);
  });

  test('RN16: OS entregue não volta para a lista; não entregue volta', async () => {
    const outra = await osFinalizada('OS-T-103');
    const entregador = await logar(request, app, 'entregador');
    await iniciar(entregador, [FIN().id, outra.id]);
    const [e1, e2] = (await ativa()).entregas.sort((a, b) => a.ordemParada - b.ordemParada);
    await entregador.post(`/entregas/${e1.id}/entregue`).send({});
    await entregador.post(`/entregas/${e2.id}/nao-entregue`).type('form').send({ motivo: 'Cliente ausente' });
    await entregador.post('/entregas/saida/encerrar').send({});

    const tela = await entregador.get('/entregas/saida');
    expect(tela.text).not.toContain(`value="${FIN().id}"`);
    expect(tela.text).toContain(`value="${outra.id}"`);
  });
});

// --------------------------------------------------------------------------
describe('geocodificação do destino', () => {
  test('busca o endereço no Nominatim depois de iniciar e grava a coordenada', async () => {
    const os = await osFinalizada('OS-T-201');
    const entregador = await logar(request, app, 'entregador');
    await iniciar(entregador, [os.id]);
    await entregaService.aguardarGeocodificacoes();

    const [url, opcoes] = fetchSimulado.mock.calls[0];
    expect(url).toMatch(/^https:\/\/nominatim\.openstreetmap\.org\/search\?/);
    expect(url).toContain('city=Dourados');
    expect(opcoes.headers['User-Agent']).toMatch(/^SGA-TI\//);

    const entrega = await prisma.entregaOS.findFirst({ where: { ordemId: os.id } });
    expect(Number(entrega.destinoLat)).toBeCloseTo(-22.221134, 6);
    expect(Number(entrega.destinoLng)).toBeCloseTo(-54.805612, 6);
  });

  test('falha na busca não impede a saída: o destino fica nulo', async () => {
    fetchSimulado.mockRejectedValue(new Error('sem rede'));
    const os = await osFinalizada('OS-T-202');
    const entregador = await logar(request, app, 'entregador');
    await iniciar(entregador, [os.id]);
    await entregaService.aguardarGeocodificacoes();

    const entrega = await prisma.entregaOS.findFirst({ where: { ordemId: os.id } });
    expect((await ativa()).status).toBe('EM_ROTA');
    expect(entrega.destinoLat).toBeNull();
  });

  test('cliente sem endereço nem chega a consultar o Nominatim', async () => {
    const entregador = await logar(request, app, 'entregador');
    await iniciar(entregador, [FIN().id]); // cliente da fixture não tem rua
    await entregaService.aguardarGeocodificacoes();
    expect(fetchSimulado).not.toHaveBeenCalled();
  });
});

// --------------------------------------------------------------------------
describe('posição do entregador', () => {
  const POS = { lat: -22.2211, lng: -54.8056, precisao: 12 };

  test('o entregador da saída grava a posição (201)', async () => {
    const entregador = await logar(request, app, 'entregador');
    await iniciar(entregador, [FIN().id]);

    const r = await entregador.post('/entregas/saida/posicao').send(POS);
    expect(r.status).toBe(201);
    expect(await prisma.posicaoEntrega.count()).toBe(1);
  });

  test('RN21: a menos de 5 s da anterior é descartada sem erro (202)', async () => {
    const entregador = await logar(request, app, 'entregador');
    await iniciar(entregador, [FIN().id]);
    await entregador.post('/entregas/saida/posicao').send(POS);

    const r = await entregador.post('/entregas/saida/posicao').send(POS);
    expect(r.status).toBe(202);
    expect(r.body).toEqual({ descartada: true });
    expect(await prisma.posicaoEntrega.count()).toBe(1);
  });

  test('RN20: latitude ou longitude fora do intervalo é recusada (400)', async () => {
    const entregador = await logar(request, app, 'entregador');
    await iniciar(entregador, [FIN().id]);

    for (const ruim of [{ lat: 91, lng: 0 }, { lat: 0, lng: -181 }, { lat: 'abc', lng: 0 }, { lng: 0 }]) {
      const r = await entregador.post('/entregas/saida/posicao').send(ruim);
      expect(r.status).toBe(400);
    }
    expect(await prisma.posicaoEntrega.count()).toBe(0);
  });

  test('RN19: sem saída em rota (409) e na saída de outro usuário (403)', async () => {
    const admin = await logar(request, app, 'admin');
    expect((await admin.post('/entregas/saida/posicao').send(POS)).status).toBe(409);

    const entregador = await logar(request, app, 'entregador');
    await iniciar(entregador, [FIN().id]);
    expect((await admin.post('/entregas/saida/posicao').send(POS)).status).toBe(403);
    expect(await prisma.posicaoEntrega.count()).toBe(0);
  });
});

// --------------------------------------------------------------------------
describe('paradas, encerramento e cancelamento', () => {
  test('RN22: entregue limpa o token e libera a OS', async () => {
    const entregador = await logar(request, app, 'entregador');
    await iniciar(entregador, [FIN().id]);
    const e = (await ativa()).entregas[0];
    await prisma.entregaOS.update({ where: { id: e.id }, data: { tokenHash: 'b'.repeat(64) } });

    await entregador.post(`/entregas/${e.id}/entregue`).send({});
    const depois = await prisma.entregaOS.findUnique({ where: { id: e.id } });

    expect(depois.status).toBe('ENTREGUE');
    expect(depois.entregueEm).not.toBeNull();
    expect(depois.tokenHash).toBeNull();
    expect(depois.ordemPendenteId).toBeNull();
  });

  test('RN23: não entregue sem motivo é recusado; com motivo, grava', async () => {
    const entregador = await logar(request, app, 'entregador');
    await iniciar(entregador, [FIN().id]);
    const e = (await ativa()).entregas[0];

    await entregador.post(`/entregas/${e.id}/nao-entregue`).type('form').send({ motivo: ' ' });
    expect((await entregador.get('/entregas/saida')).text).toMatch(/Informe o motivo/);
    expect((await prisma.entregaOS.findUnique({ where: { id: e.id } })).status).toBe('PENDENTE');

    await entregador.post(`/entregas/${e.id}/nao-entregue`).type('form').send({ motivo: 'Portão fechado' });
    const depois = await prisma.entregaOS.findUnique({ where: { id: e.id } });
    expect(depois.status).toBe('NAO_ENTREGUE');
    expect(depois.motivo).toBe('Portão fechado');
  });

  test('RN24: encerrar com parada pendente é recusado; marcadas todas, conclui', async () => {
    const entregador = await logar(request, app, 'entregador');
    await iniciar(entregador, [FIN().id]);
    const saida = await ativa();

    await entregador.post('/entregas/saida/encerrar').send({});
    expect((await entregador.get('/entregas/saida')).text).toMatch(/Ainda há entregas pendentes/);
    expect((await prisma.saidaEntrega.findUnique({ where: { id: saida.id } })).status).toBe('EM_ROTA');

    await entregador.post(`/entregas/${saida.entregas[0].id}/entregue`).send({});
    await entregador.post('/entregas/saida/encerrar').send({});
    const fim = await prisma.saidaEntrega.findUnique({ where: { id: saida.id } });
    expect(fim.status).toBe('CONCLUIDA');
    expect(fim.emRota).toBeNull();
    expect(fim.encerradaEm).not.toBeNull();
  });

  test('RN25: o administrador cancela — pendentes viram não entregues e os tokens somem', async () => {
    const outra = await osFinalizada('OS-T-301');
    const entregador = await logar(request, app, 'entregador');
    await iniciar(entregador, [FIN().id, outra.id]);
    const saida = await ativa();
    const [e1, e2] = saida.entregas;
    await entregador.post(`/entregas/${e1.id}/entregue`).send({});
    await prisma.entregaOS.update({ where: { id: e2.id }, data: { tokenHash: 'c'.repeat(64) } });

    const admin = await logar(request, app, 'admin');
    await admin.post(`/entregas/saidas/${saida.id}/cancelar`).send({});

    const fim = await prisma.saidaEntrega.findUnique({ where: { id: saida.id }, include: { entregas: true } });
    expect(fim.status).toBe('CANCELADA');
    expect(fim.emRota).toBeNull();
    const porId = Object.fromEntries(fim.entregas.map((e) => [e.id, e]));
    expect(porId[e1.id].status).toBe('ENTREGUE');                 // o que foi entregue fica
    expect(porId[e2.id].status).toBe('NAO_ENTREGUE');
    expect(porId[e2.id].motivo).toBe('Saída cancelada');
    expect(fim.entregas.every((e) => e.tokenHash === null && e.ordemPendenteId === null)).toBe(true);
  });
});

// --------------------------------------------------------------------------
describe('auditoria', () => {
  test('registra os eventos da saída e NÃO registra as posições', async () => {
    const entregador = await logar(request, app, 'entregador');
    await iniciar(entregador, [FIN().id]);
    const saida = await ativa();
    await entregador.post('/entregas/saida/posicao').send({ lat: -22.22, lng: -54.80 });
    await entregador.post(`/entregas/${saida.entregas[0].id}/entregue`).send({});
    await entregador.post('/entregas/saida/encerrar').send({});
    await aguardarGravacoes();

    // Só inclusões e alterações: a limpeza da fixture entre os testes gera
    // EXCLUSAO em massa, sem autor, que não fazem parte deste fluxo.
    const logs = await prisma.logAuditoria.findMany({
      where: {
        entidade: { in: ['SaidaEntrega', 'EntregaOS', 'PosicaoEntrega'] },
        acao:     { in: ['INCLUSAO', 'ALTERACAO'] },
      },
    });
    const tem = (entidade, acao) => logs.some((l) => l.entidade === entidade && l.acao === acao);

    expect(await prisma.posicaoEntrega.count()).toBe(1);   // a posição foi gravada...
    expect(logs.some((l) => l.entidade === 'PosicaoEntrega')).toBe(false); // ...mas não auditada
    expect(tem('SaidaEntrega', 'INCLUSAO')).toBe(true);    // iniciar
    expect(tem('EntregaOS', 'INCLUSAO')).toBe(true);
    expect(tem('EntregaOS', 'ALTERACAO')).toBe(true);      // marcar
    expect(tem('SaidaEntrega', 'ALTERACAO')).toBe(true);   // encerrar
    expect(logs.every((l) => l.usuarioId === dados.usuarios.entregador.id)).toBe(true);
  });
});
