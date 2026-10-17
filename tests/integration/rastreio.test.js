require('../helpers/ambiente'); // precisa vir antes de src/app

const crypto  = require('crypto');
const request = require('supertest');
const app     = require('../../src/app');
const { semear, logar, prisma, dias } = require('../helpers/fixture');
const { memoriaRastreioIp, TENTATIVAS_RASTREIO_IP, TENTATIVAS_RASTREIO_OS } = require('../../src/config/seguranca');
const entregaService = require('../../src/services/entregaService');
const geocodificacao = require('../../src/services/geocodificacaoService');

/**
 * Módulo 6 — o cliente acompanha a entrega pela consulta pública (RN26 a RN32)
 * e o aviso pelo WhatsApp na tela do entregador. O Nominatim é simulado.
 */

let dados;
let fetchSimulado;
let os;          // OS finalizada do cliente com telefone
let entregador;  // agente logado

beforeEach(async () => {
  dados = await semear();
  geocodificacao._reiniciarFila({ intervalo: 1 });
  fetchSimulado = jest.spyOn(global, 'fetch').mockResolvedValue({
    ok: true, json: async () => [{ lat: '-22.2236', lon: '-54.7725' }],
  });
  os = await osFinalizada('OS-T-701', { celular: '(67) 99264-0369', telefone: '(67) 3421-8899' });
  entregador = await logar(request, app, 'entregador');
});
afterEach(async () => {
  await entregaService.aguardarGeocodificacoes();
  fetchSimulado.mockRestore();
});
afterAll(async () => { await prisma.$disconnect(); });

async function osFinalizada(numero, contato) {
  const c = await prisma.cliente.create({
    data: {
      nome: 'Padaria Teste', cpfCnpj: `${numero.slice(-3)}-RASTREIO`,
      endereco: 'Av. Marcelino Pires', numero: '1200', cidade: 'Dourados', estado: 'MS', ...contato,
    },
  });
  const eq = await prisma.equipamento.create({
    data: { codigo: `EQ-${numero}`, tipo: 'DESKTOP', marca: 'Dell', modelo: 'X', defeito: 'Teste', clienteId: c.id },
  });
  return prisma.ordemServico.create({
    data: {
      numero, status: 'FINALIZADO', defeitoRelatado: 'Teste', equipamentoId: eq.id,
      usuarioId: dados.usuarios.atendente.id, dataFechamento: dias(-1),
    },
  });
}

async function sair(...ordens) {
  await entregador.post('/entregas/saida').type('form').send({ ordemIds: ordens.map((o) => String(o.id)) });
  await entregaService.aguardarGeocodificacoes();
}

const consultar = (numero) => request(app).post('/consulta').type('form').send({ numero });
const verificar = (numero, digitos) =>
  request(app).post('/consulta/rastreio').type('form').send({ numero, digitos });
const tokenDa = (html) => (html.match(/data-token="([0-9a-f]{64})"/) || [])[1];

// --------------------------------------------------------------------------
describe('RN26 — o bloco da entrega só aparece com a OS em rota', () => {
  test('em rota: aparece o pedido dos 4 dígitos, sem mapa ainda', async () => {
    await sair(os);
    const r = await consultar(os.numero);

    expect(r.text).toContain('Seu equipamento saiu para entrega');
    expect(r.text).toContain('action="/consulta/rastreio"');
    expect(r.text).not.toContain('mapa-entrega');
  });

  test('fora de rota: nada de entrega na consulta', async () => {
    const r = await consultar(os.numero);
    expect(r.text).not.toContain('saiu para entrega');
  });

  test('o link do WhatsApp só preenche o campo — a busca continua sendo o POST', async () => {
    const r = await request(app).get(`/consulta?numero=${os.numero}`);
    expect(r.text).toContain(`value="${os.numero}"`);
    expect(r.text).not.toContain('Resultado da Consulta');

    const lixo = await request(app).get('/consulta?numero=%22%3E%3Cscript%3E');
    expect(lixo.text).toContain('value=""');
  });
});

describe('RN27 e RN29 — verificação e token', () => {
  test('dígitos errados: sem mapa, com aviso', async () => {
    await sair(os);
    const r = await verificar(os.numero, '1234');
    expect(r.text).toMatch(/não conferem/);
    expect(tokenDa(r.text)).toBeUndefined();
  });

  test('dígitos certos (celular ou fixo): mapa com token, e só o hash vai para o banco', async () => {
    await sair(os);
    for (const digitos of ['0369', '8899']) {
      const r = await verificar(os.numero, digitos);
      const token = tokenDa(r.text);
      expect(token).toMatch(/^[0-9a-f]{64}$/);
      expect(r.text).toContain('/vendor/leaflet/leaflet.js');

      const e = await prisma.entregaOS.findFirst({ where: { ordemId: os.id } });
      expect(e.tokenHash).toBe(crypto.createHash('sha256').update(token).digest('hex'));
      expect(e.tokenHash).not.toBe(token);
    }
  });

  test('uma verificação nova invalida o token anterior', async () => {
    await sair(os);
    const antigo = tokenDa((await verificar(os.numero, '0369')).text);
    const novo = tokenDa((await verificar(os.numero, '0369')).text);

    expect((await request(app).get(`/rastreio/${antigo}/posicao`)).status).toBe(404);
    expect((await request(app).get(`/rastreio/${novo}/posicao`)).status).toBe(200);
  });

  test('RN31: cliente sem telefone não recebe o formulário', async () => {
    const semTel = await osFinalizada('OS-T-702', {});
    await sair(semTel);
    const r = await consultar(semTel.numero);

    expect(r.text).toMatch(/fale com a loja/);
    expect(r.text).not.toContain('action="/consulta/rastreio"');
  });
});

describe('RN30 — posição pública', () => {
  test('devolve só lat, lng, atualizadoEm, destino e status', async () => {
    await sair(os);
    await entregador.post('/entregas/saida/posicao').send({ lat: -22.2250, lng: -54.8120, precisao: 9 });
    const token = tokenDa((await verificar(os.numero, '0369')).text);

    const r = await request(app).get(`/rastreio/${token}/posicao`);
    expect(r.status).toBe(200);
    expect(Object.keys(r.body).sort()).toEqual(['atualizadoEm', 'destino', 'lat', 'lng', 'status']);
    expect(r.body).toMatchObject({ lat: -22.225, lng: -54.812, status: 'EM_ROTA', destino: { lat: -22.2236, lng: -54.7725 } });
    expect(JSON.stringify(r.body)).not.toMatch(/Entregador|entregador|saida|precisao/);
    expect(r.headers['cache-control']).toBe('no-store');
  });

  test('token aleatório, malformado ou de entrega concluída: 404 genérico', async () => {
    await sair(os);
    const token = tokenDa((await verificar(os.numero, '0369')).text);

    const aleatorio = await request(app).get(`/rastreio/${'a'.repeat(64)}/posicao`);
    const malformado = await request(app).get('/rastreio/xyz/posicao');
    expect([aleatorio.status, malformado.status]).toEqual([404, 404]);
    expect(aleatorio.body).toEqual(malformado.body);

    const e = await prisma.entregaOS.findFirst({ where: { ordemId: os.id } });
    await entregador.post(`/entregas/${e.id}/entregue`).send({});
    expect((await request(app).get(`/rastreio/${token}/posicao`)).status).toBe(404);
  });

  test('RN32: depois de entregue, a consulta mostra a data e a hora', async () => {
    await sair(os);
    const e = await prisma.entregaOS.findFirst({ where: { ordemId: os.id } });
    await entregador.post(`/entregas/${e.id}/entregue`).send({});

    const r = await consultar(os.numero);
    expect(r.text).toMatch(/Entregue em \d{2}\/\d{2}\/\d{4}\s+às \d{2}:\d{2}/);
    expect(r.text).not.toContain('saiu para entrega');
  });
});

describe('RN28 — limite de tentativas dos 4 dígitos', () => {
  test(`por IP: o erro ${TENTATIVAS_RASTREIO_IP + 1} leva 429`, async () => {
    await sair(os);
    for (let i = 0; i < TENTATIVAS_RASTREIO_IP; i += 1) {
      expect((await verificar(os.numero, '1111')).status).toBe(200);
    }
    const r = await verificar(os.numero, '0369'); // nem o certo passa
    expect(r.status).toBe(429);
    expect(tokenDa(r.text)).toBeUndefined();
  });

  test(`por OS: mesmo trocando de IP, o erro ${TENTATIVAS_RASTREIO_OS + 1} na mesma OS leva 429`, async () => {
    await sair(os);
    for (let i = 0; i < TENTATIVAS_RASTREIO_OS; i += 1) {
      memoriaRastreioIp.resetAll();          // simula um IP novo a cada tentativa
      expect((await verificar(os.numero, '1111')).status).toBe(200);
    }
    memoriaRastreioIp.resetAll();
    expect((await verificar(os.numero, '0369')).status).toBe(429);
  });

  test('a cota por OS é da OS: esgotar a de uma não bloqueia outra', async () => {
    // Nos testes todas as requisições vêm do mesmo IP; sem isto, contar por OS
    // ou por IP daria o mesmo resultado e o teste anterior não distinguiria.
    const outra = await osFinalizada('OS-T-703', { celular: '(67) 98888-1111' });
    await sair(os, outra);
    for (let i = 0; i < TENTATIVAS_RASTREIO_OS; i += 1) {
      memoriaRastreioIp.resetAll();
      await verificar(os.numero, '1111');
    }
    memoriaRastreioIp.resetAll();
    expect((await verificar(os.numero, '0369')).status).toBe(429);
    const r = await verificar(outra.numero, '1111');
    expect(r.status).toBe(200);
  });

  test('acertar não consome a cota', async () => {
    await sair(os);
    for (let i = 0; i < TENTATIVAS_RASTREIO_IP + 3; i += 1) {
      expect(tokenDa((await verificar(os.numero, '0369')).text)).toBeDefined();
    }
  });
});

describe('consulta pública com alguém logado no mesmo navegador', () => {
  test('o funcionário logado consulta e verifica sem levar 403 do CSRF', async () => {
    // Achado no navegador: o formulário público não tem token CSRF, e o
    // middleware exigia token de todo POST de usuário logado.
    await sair(os);
    // Agente logado à mão, SEM o cabeçalho de token que o logar() da fixture
    // acrescenta: é como o navegador envia um formulário público.
    const logado = request.agent(app);
    await logado.post('/login').type('form').send({ login: 'atendente', senha: dados.SENHA });

    const consulta = await logado.post('/consulta').type('form').send({ numero: os.numero });
    expect(consulta.status).toBe(200);
    expect(consulta.text).toContain('saiu para entrega');

    const r = await logado.post('/consulta/rastreio').type('form').send({ numero: os.numero, digitos: '0369' });
    expect(r.status).toBe(200);
    expect(tokenDa(r.text)).toBeDefined();
  });
});

describe('aviso pelo WhatsApp (tela do entregador)', () => {
  test('o cartão traz o link wa.me com o celular e a consulta já com o número', async () => {
    await sair(os);
    const tela = await entregador.get('/entregas/saida');
    const href = (tela.text.match(/href="(https:\/\/wa\.me\/[^"]+)"/) || [])[1];

    expect(href).toBeDefined();
    const url = href.replace(/&amp;/g, '&');
    expect(url.startsWith('https://wa.me/5567992640369?text=')).toBe(true);
    expect(decodeURIComponent(url.split('text=')[1])).toMatch(new RegExp(`/consulta\\?numero=${os.numero}`));
  });

  test('o Leaflet é servido pelo próprio sistema', async () => {
    const r = await request(app).get('/vendor/leaflet/leaflet.js');
    expect(r.status).toBe(200);
    expect(r.text).toMatch(/Leaflet/);
  });
});
