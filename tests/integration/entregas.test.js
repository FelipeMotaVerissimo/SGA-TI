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

  test('RN21 sob rajada: envios simultâneos gravam uma posição só', async () => {
    // Visto no teste com celular real: ao desbloquear a tela, o Android
    // disparou de uma vez os envios acumulados, e os três passavam.
    const entregador = await logar(request, app, 'entregador');
    await iniciar(entregador, [FIN().id]);

    const respostas = await Promise.all([1, 2, 3].map(() =>
      entregador.post('/entregas/saida/posicao').send(POS)));

    expect(respostas.map((r) => r.status).sort()).toEqual([201, 202, 202]);
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

// --------------------------------------------------------------------------
describe('tela do entregador (Etapa 4)', () => {
  test('o entregador da saída recebe o script do GPS e a faixa de status', async () => {
    const entregador = await logar(request, app, 'entregador');
    await iniciar(entregador, [FIN().id]);
    const tela = await entregador.get('/entregas/saida');

    expect(tela.text).toContain('<script src="/js/entregador.js" defer></script>');
    expect(tela.text).toContain('id="painel-gps" class="painel-gps" data-enviar="1"');
    expect(tela.text).toMatch(/class="gps-faixa/);
  });

  test('o administrador acompanha, mas não envia posição (RN19)', async () => {
    const entregador = await logar(request, app, 'entregador');
    await iniciar(entregador, [FIN().id]);
    const tela = await (await logar(request, app, 'admin')).get('/entregas/saida');

    expect(tela.text).toContain('data-enviar="0"');
    expect(tela.text).not.toContain('/js/entregador.js');
    expect(tela.text).toMatch(/Acompanhando a saída de/);
  });

  test('sem saída em rota, nada de GPS', async () => {
    const tela = await (await logar(request, app, 'entregador')).get('/entregas/saida');
    expect(tela.text).not.toContain('/js/entregador.js');
    expect(tela.text).not.toContain('painel-gps');
  });

  test('cada parada pendente tem Navegar, Entregue e o formulário de motivo', async () => {
    const os = await osFinalizada('OS-T-401');
    const entregador = await logar(request, app, 'entregador');
    await iniciar(entregador, [os.id]);
    await entregaService.aguardarGeocodificacoes();
    const tela = await entregador.get('/entregas/saida');

    // Com a coordenada geocodificada, o Navegar vai direto ao ponto.
    expect(tela.text).toContain('https://www.google.com/maps/dir/?api=1&amp;destination=-22.221134%2C-54.805612');
    expect(tela.text).toMatch(/action="\/entregas\/\d+\/entregue"/);
    expect(tela.text).toMatch(/<details class="parada-nao-entregue">[\s\S]*name="motivo" required minlength="3"/);
  });

  test('sem coordenada, o Navegar usa o endereço em texto', async () => {
    fetchSimulado.mockResolvedValue({ ok: true, json: async () => [] });
    const os = await osFinalizada('OS-T-402');
    const entregador = await logar(request, app, 'entregador');
    await iniciar(entregador, [os.id]);
    await entregaService.aguardarGeocodificacoes();
    const tela = await entregador.get('/entregas/saida');

    expect(tela.text).toContain('destination=Rua%20Hayel%20Bon%20Faker%2C%201200%2C%20Centro%2C%20Dourados%2C%20MS');
  });
});

// --------------------------------------------------------------------------
describe('painel do administrador (Etapa 6)', () => {
  const ROTAS_PAINEL = ['/entregas', '/entregas/painel/posicao'];
  const porParada = (entregas) => [...entregas].sort((a, b) => a.ordemParada - b.ordemParada);

  test('RN33: o administrador abre o painel', async () => {
    const r = await (await logar(request, app, 'admin')).get('/entregas');
    expect(r.status).toBe(200);
    expect(r.text).toContain('Painel de entregas');
  });

  test.each(['entregador', 'atendente', 'tecnico', 'vendedor', 'financeiro', 'compras'])(
    'RN33: %s não abre o painel nem a posição dele', async (login) => {
      const agente = await logar(request, app, login);
      for (const rota of ROTAS_PAINEL) {
        const r = await agente.get(rota);
        expect(r.status).toBe(302);
        expect(r.headers.location).toBe('/dashboard');
      }
    });

  test('o menu leva o administrador ao painel e o entregador à saída', async () => {
    const admin = await (await logar(request, app, 'admin')).get('/dashboard');
    expect(admin.text).toContain('href="/entregas" class');
    expect(admin.text).not.toContain('href="/entregas/saida" class');

    const entregador = await (await logar(request, app, 'entregador')).get('/entregas/saida');
    expect(entregador.text).toContain('href="/entregas/saida" class');
    expect(entregador.text).not.toContain('href="/entregas" class');
  });

  test('sem saída em rota: aviso na tela e 404 na posição', async () => {
    const admin = await logar(request, app, 'admin');
    const tela = await admin.get('/entregas');
    expect(tela.text).toContain('Nenhuma saída em rota no momento.');
    expect(tela.text).not.toContain('id="mapa-painel"');

    expect((await admin.get('/entregas/painel/posicao')).status).toBe(404);
  });

  test('RN34: com saída em rota, mostra as paradas, os destinos e o botão de cancelar', async () => {
    // A fixture não tem rua; estas duas têm endereço e são geocodificadas.
    const os1 = await osFinalizada('OS-T-601');
    const os2 = await osFinalizada('OS-T-611');
    const entregador = await logar(request, app, 'entregador');
    await iniciar(entregador, [os1.id, os2.id]);
    await entregaService.aguardarGeocodificacoes();
    const saida = await ativa();

    const tela = await (await logar(request, app, 'admin')).get('/entregas');
    expect(tela.text).toContain('id="mapa-painel"');
    expect(tela.text).toContain('OS-T-611');
    expect(tela.text).toContain('Cliente OS-T-601');
    expect(tela.text).not.toContain('(sem localização)');
    expect(tela.text).toContain(`action="/entregas/saidas/${saida.id}/cancelar"`);
    expect(tela.text).toContain('/js/painel-entregas.js');

    // Os pinos vão no atributo data-destinos: as duas paradas, só os campos do mapa.
    const attr = tela.text.match(/data-destinos="([^"]*)"/)[1].replace(/&#34;/g, '"');
    const destinos = JSON.parse(attr);
    expect(destinos.map((d) => d.parada)).toEqual([1, 2]);
    for (const d of destinos) {
      expect(Object.keys(d).sort()).toEqual(['id', 'lat', 'lng', 'os', 'parada', 'status']);
      expect(d.lat).toBeCloseTo(-22.221134, 5);
      expect(d.status).toBe('PENDENTE');
    }
  });

  test('parada sem geocodificação fica fora do mapa e marcada na tabela', async () => {
    fetchSimulado.mockResolvedValue({ ok: true, json: async () => [] });
    const os = await osFinalizada('OS-T-604');
    const entregador = await logar(request, app, 'entregador');
    await iniciar(entregador, [os.id]);
    await entregaService.aguardarGeocodificacoes();

    const tela = await (await logar(request, app, 'admin')).get('/entregas');
    expect(tela.text).toContain('data-destinos="[]"');
    expect(tela.text).toContain('(sem localização)');
  });

  test('a posição do painel traz o entregador e o status de cada parada, e nada mais', async () => {
    const outra = await osFinalizada('OS-T-602');
    const entregador = await logar(request, app, 'entregador');
    await iniciar(entregador, [FIN().id, outra.id]);
    const saida = await ativa();
    const admin = await logar(request, app, 'admin');

    // Antes da primeira posição, o entregador ainda não aparece.
    let r = await admin.get('/entregas/painel/posicao');
    expect(r.status).toBe(200);
    expect(r.body.posicao).toBeNull();

    await entregador.post('/entregas/saida/posicao').send({ lat: -22.2301, lng: -54.8102 });
    const [e1] = porParada(saida.entregas);
    await entregador.post(`/entregas/${e1.id}/entregue`).send({});

    r = await admin.get('/entregas/painel/posicao');
    expect(r.status).toBe(200);
    expect(Object.keys(r.body).sort()).toEqual(['entregas', 'posicao', 'saidaId', 'status']);
    expect(r.body).toMatchObject({ saidaId: saida.id, status: 'EM_ROTA' });
    expect(Object.keys(r.body.posicao).sort()).toEqual(['atualizadoEm', 'lat', 'lng']);
    expect(r.body.posicao.lat).toBeCloseTo(-22.2301, 4);
    expect(r.body.posicao.lng).toBeCloseTo(-54.8102, 4);
    expect(r.body.entregas.map((e) => e.status)).toEqual(['ENTREGUE', 'PENDENTE']);
    for (const e of r.body.entregas) expect(Object.keys(e).sort()).toEqual(['id', 'status']);
  });

  test('histórico: mais nova primeiro, com a contagem por resultado', async () => {
    const outra = await osFinalizada('OS-T-603');
    const entregador = await logar(request, app, 'entregador');

    // 1ª saída: uma entregue, uma não entregue, encerrada.
    await iniciar(entregador, [FIN().id, outra.id]);
    const primeira = await ativa();
    const [a, b] = porParada(primeira.entregas);
    await entregador.post(`/entregas/${a.id}/entregue`).send({});
    await entregador.post(`/entregas/${b.id}/nao-entregue`).type('form').send({ motivo: 'Cliente ausente' });
    await entregador.post('/entregas/saida/encerrar').send({});

    // 2ª saída: a não entregue sai de novo e fica em rota.
    await iniciar(entregador, [outra.id]);
    const segunda = await ativa();
    await prisma.saidaEntrega.update({ where: { id: segunda.id }, data: { iniciadaEm: new Date(Date.now() + 60000) } });

    const hist = await entregaService.listarHistorico();
    expect(hist.map((s) => s.id)).toEqual([segunda.id, primeira.id]);
    expect(hist[1]).toMatchObject({ status: 'CONCLUIDA', totalOS: 2, entregues: 1, naoEntregues: 1, pendentes: 0 });
    expect(hist[0]).toMatchObject({ status: 'EM_ROTA', totalOS: 1, entregues: 0, naoEntregues: 0, pendentes: 1 });
    expect(hist[0].entregador.nome).toBeTruthy();

    const tela = await (await logar(request, app, 'admin')).get('/entregas');
    expect(tela.text.match(/class="linha-saida"/g)).toHaveLength(2);
    expect(tela.text).toContain('Concluída');

    // O teto corta pelas mais antigas.
    expect((await entregaService.listarHistorico(1)).map((s) => s.id)).toEqual([segunda.id]);
  });

  test('cancelar pelo painel volta ao painel, sem saída em rota', async () => {
    const entregador = await logar(request, app, 'entregador');
    await iniciar(entregador, [FIN().id]);
    const saida = await ativa();

    const admin = await logar(request, app, 'admin');
    const r = await admin.post(`/entregas/saidas/${saida.id}/cancelar`).send({});
    expect(r.headers.location).toBe('/entregas');

    const tela = await admin.get('/entregas');
    expect(tela.text).toContain('Saída cancelada.');
    expect(tela.text).toContain('Nenhuma saída em rota no momento.');
    expect(tela.text).toMatch(/badge-cinza">Cancelada</);
  });
});

// --------------------------------------------------------------------------
describe('fuso de Dourados na tela do entregador', () => {
  // A suíte roda em UTC (tests/globalSetup.js), como um servidor: é aí que um
  // horário formatado sem fuso sai errado. Na máquina de desenvolvimento, no
  // fuso de Dourados, o defeito não aparecia.
  test('a premissa: o processo dos testes está em UTC', () => {
    expect(new Date('2026-10-19T02:30:00Z').getHours()).toBe(2);
  });

  /** Ontem às 02:30 UTC: em Dourados (UTC−4) ainda é anteontem, 22:30. */
  function madrugadaUtc() {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 1);
    d.setUTCHours(2, 30, 0, 0);
    return d;
  }
  const emDourados = (d, opcoes) => d.toLocaleString('pt-BR', { timeZone: 'America/Campo_Grande', ...opcoes });
  const emUtc      = (d, opcoes) => d.toLocaleString('pt-BR', { timeZone: 'UTC', ...opcoes });
  const DATA = { day: '2-digit', month: '2-digit', year: 'numeric' };
  const HORA = { hour: '2-digit', minute: '2-digit' };

  test('"faturada em" usa a data de Dourados', async () => {
    const quando = madrugadaUtc();
    const os = await osFinalizada('OS-T-901');
    await prisma.ordemServico.update({ where: { id: os.id }, data: { dataFechamento: quando } });
    expect(emDourados(quando, DATA)).not.toBe(emUtc(quando, DATA)); // a premissa

    const tela = await (await logar(request, app, 'entregador')).get('/entregas/saida');
    expect(tela.text).toContain(`OS-T-901 · faturada em ${emDourados(quando, DATA)}`);
  });

  test('"em rota desde" usa a hora de Dourados', async () => {
    const quando = madrugadaUtc();
    const entregador = await logar(request, app, 'entregador');
    await iniciar(entregador, [FIN().id]);
    await prisma.saidaEntrega.update({ where: { emRota: true }, data: { iniciadaEm: quando } });
    expect(emDourados(quando, HORA)).toBe('22:30'); // a premissa

    const tela = await entregador.get('/entregas/saida');
    expect(tela.text).toContain('Em rota desde 22:30');
  });
});
