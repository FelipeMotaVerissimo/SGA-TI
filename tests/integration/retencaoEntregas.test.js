require('../helpers/ambiente'); // precisa vir antes de src/app

const path = require('path');
const { execFileSync } = require('child_process');
const request = require('supertest');
const app     = require('../../src/app');
const { semear, logar, prisma, dias } = require('../helpers/fixture');
const { aguardarGravacoes } = require('../../src/services/auditoriaExtensao');
const retencao       = require('../../src/services/retencaoService');
const entregaService = require('../../src/services/entregaService');
const geocodificacao = require('../../src/services/geocodificacaoService');

/**
 * Módulo 6 — a coordenada da casa do cliente (RN35 a RN38).
 *
 * A coordenada identifica o endereço tanto quanto o endereço escrito, e o
 * sistema a espalha por mais lugares do que o pedido original previa: a
 * entrega, o log (a geocodificação grava com `updateMany`, que é auditado, e
 * cada alteração seguinte copia o registro inteiro em `valorAnterior`) e o
 * trajeto do entregador, que termina na porta do cliente. Como na lição do
 * nome que sobrevivia na descrição da conta, a prova procura a coordenada no
 * banco inteiro — não só onde se espera achá-la.
 *
 * O Nominatim é simulado e devolve sempre a mesma coordenada.
 */

const LAT = '-22.221134';
const LNG = '-54.805612';
const NOME = 'Cliente de Teste'; // o cliente da massa

let dados;
let fetchSimulado;

beforeEach(async () => {
  dados = await semear();
  geocodificacao._reiniciarFila({ intervalo: 1 });
  fetchSimulado = jest.spyOn(global, 'fetch').mockResolvedValue({
    ok: true, json: async () => [{ lat: LAT, lon: LNG }],
  });
  // A massa não tem rua; sem endereço, a geocodificação nem chega a rodar.
  await prisma.cliente.update({
    where: { id: dados.cliente.id },
    data:  { endereco: 'Rua Hayel Bon Faker', numero: '1200', bairro: 'Centro' },
  });
});
afterEach(async () => {
  await entregaService.aguardarGeocodificacoes();
  fetchSimulado.mockRestore();
});
afterAll(async () => { await prisma.$disconnect(); });

/** Entregas, log inteiro e posições, como texto: onde a coordenada pode estar. */
async function banco() {
  await entregaService.aguardarGeocodificacoes();
  await aguardarGravacoes();
  return JSON.stringify([
    await prisma.entregaOS.findMany(),
    await prisma.logAuditoria.findMany(),
    await prisma.posicaoEntrega.findMany(),
  ]);
}

/** OS finalizada de outro cliente, também com endereço. */
async function osDeOutroCliente(numero) {
  const c = await prisma.cliente.create({
    data: {
      nome: `Outro ${numero}`, cpfCnpj: `${numero.slice(-6)}-OUT`, endereco: 'Av. Marcelino Pires',
      numero: '500', bairro: 'Centro', cidade: 'Dourados', estado: 'MS',
    },
  });
  const eq = await prisma.equipamento.create({
    data: { codigo: `EQ-${numero}`, tipo: 'NOTEBOOK', marca: 'Dell', modelo: 'X', defeito: 'Teste', clienteId: c.id },
  });
  return prisma.ordemServico.create({
    data: {
      numero, status: 'FINALIZADO', defeitoRelatado: 'Teste', equipamentoId: eq.id,
      usuarioId: dados.usuarios.atendente.id, dataFechamento: dias(-1),
    },
  });
}

/** O entregador sai, manda GPS e inicia a saída; devolve a saída em rota. */
async function sair(ordemIds) {
  const entregador = await logar(request, app, 'entregador');
  await entregador.post('/entregas/saida').type('form').send({ ordemIds: ordemIds.map(String) });
  await entregaService.aguardarGeocodificacoes();
  await entregador.post('/entregas/saida/posicao').send({ lat: -22.2215, lng: -54.8058 });
  const saida = await prisma.saidaEntrega.findUnique({ where: { emRota: true }, include: { entregas: true } });
  return { entregador, saida };
}

/** Saída inteira: a OS da massa não é entregue (motivo com o nome) e a saída é encerrada. */
async function entregaConcluida(ordemIds = [dados.ordens.finalizado.id]) {
  const { entregador, saida } = await sair(ordemIds);
  for (const e of saida.entregas) {
    if (e.ordemId === dados.ordens.finalizado.id) {
      await entregador.post(`/entregas/${e.id}/nao-entregue`).type('form').send({ motivo: `${NOME} não estava em casa` });
    } else {
      await entregador.post(`/entregas/${e.id}/entregue`).send({});
    }
  }
  await entregador.post('/entregas/saida/encerrar').send({});
  await aguardarGravacoes();
  return saida;
}

const anonimizar = async () =>
  (await logar(request, app, 'admin')).post(`/clientes/${dados.cliente.id}/anonimizar`).type('form').send({});

// --------------------------------------------------------------------------
describe('anonimização alcança a entrega (RN37)', () => {
  test('a premissa: a coordenada chega à entrega e ao log, e o nome ao motivo', async () => {
    const saida = await entregaConcluida();

    const entrega = await prisma.entregaOS.findFirst({ where: { saidaId: saida.id } });
    expect(Number(entrega.destinoLat)).toBeCloseTo(Number(LAT), 6);
    const tudo = await banco();
    expect(tudo).toContain(LAT);
    expect(tudo).toContain(LNG);
    expect(tudo).toContain(`${NOME} não estava`);
    // A coordenada está também no log, não só na entrega.
    expect(JSON.stringify(await prisma.logAuditoria.findMany({ where: { entidade: 'EntregaOS' } }))).toContain(LAT);
    expect(await prisma.posicaoEntrega.count({ where: { saidaId: saida.id } })).toBe(1);
  });

  test('depois de anonimizar, a coordenada e o nome não sobram em lugar nenhum', async () => {
    const saida = await entregaConcluida();
    await anonimizar();

    const tudo = await banco();
    expect(tudo).not.toContain(LAT);
    expect(tudo).not.toContain(LNG);
    expect(tudo).not.toContain(NOME);
    expect(await prisma.posicaoEntrega.count({ where: { saidaId: saida.id } })).toBe(0);
  });

  test('a saída e a entrega continuam no histórico, com status, horário e motivo redigido', async () => {
    const saida = await entregaConcluida();
    await anonimizar();

    const depois = await prisma.saidaEntrega.findUnique({ where: { id: saida.id }, include: { entregas: true } });
    expect(depois.status).toBe('CONCLUIDA');
    expect(depois.encerradaEm).not.toBeNull();
    const [e] = depois.entregas;
    expect(e.status).toBe('NAO_ENTREGUE');
    expect(e.motivo).toBe(`${retencao.NOME_ANONIMO} não estava em casa`);
    expect(e.destinoLat).toBeNull();
    expect(e.destinoLng).toBeNull();
  });

  test('a entrega de outro cliente na mesma saída fica com o destino', async () => {
    const outra = await osDeOutroCliente('OS-T-801');
    const saida = await entregaConcluida([dados.ordens.finalizado.id, outra.id]);
    await anonimizar();

    const daOutra = await prisma.entregaOS.findFirst({ where: { saidaId: saida.id, ordemId: outra.id } });
    expect(daOutra.status).toBe('ENTREGUE');
    expect(Number(daOutra.destinoLat)).toBeCloseTo(Number(LAT), 6);
    // O trajeto é da saída inteira, e sai inteiro (decisão de 18/10/2026).
    expect(await prisma.posicaoEntrega.count({ where: { saidaId: saida.id } })).toBe(0);
  });

  test('RN38: cliente com entrega pendente não é anonimizado', async () => {
    const { saida } = await sair([dados.ordens.finalizado.id]);
    const admin = await logar(request, app, 'admin');
    await admin.post(`/clientes/${dados.cliente.id}/anonimizar`).type('form').send({});

    const tela = await admin.get('/clientes?inativos=1');
    expect(tela.text).toContain('Conclua ou cancele a entrega antes de anonimizar');
    const cliente = await prisma.cliente.findUnique({ where: { id: dados.cliente.id } });
    expect(cliente.nome).toBe(NOME);
    expect(cliente.anonimizadoEm).toBeNull();
    const e = await prisma.entregaOS.findFirst({ where: { saidaId: saida.id } });
    expect(Number(e.destinoLat)).toBeCloseTo(Number(LAT), 6);
    expect(await prisma.posicaoEntrega.count({ where: { saidaId: saida.id } })).toBe(1);
  });

  test('o reparo alcança cliente anonimizado antes desta regra, e é idempotente', async () => {
    await entregaConcluida();
    // A anonimização de antes: só o cadastro.
    await prisma.cliente.update({
      where: { id: dados.cliente.id },
      data: {
        nome: retencao.NOME_ANONIMO, cpfCnpj: retencao.documentoAnonimo(dados.cliente.id),
        endereco: null, ativo: false, anonimizadoEm: new Date(),
      },
    });
    expect(await banco()).toContain(LAT);

    const primeira = await retencao.repararAnonimizacao(dados.cliente.id);
    expect(primeira).toMatchObject({ entregasRedigidas: 1, posicoesApagadas: 1 });
    expect(primeira.logEntregasRedigidos).toBeGreaterThan(0);
    const tudo = await banco();
    expect(tudo).not.toContain(LAT);
    expect(tudo).not.toContain(NOME);

    const segunda = await retencao.repararAnonimizacao(dados.cliente.id);
    expect(segunda).toMatchObject({ entregasRedigidas: 0, posicoesApagadas: 0, logEntregasRedigidos: 0 });
  });
});

// --------------------------------------------------------------------------
describe('retenção do trajeto (RN35 e RN36)', () => {
  const encerradaHa = (saida, n) =>
    prisma.saidaEntrega.update({ where: { id: saida.id }, data: { encerradaEm: dias(-n) } });

  test('passados 30 dias do fim, o trajeto e o destino saem; antes disso, ficam', async () => {
    // As duas saídas antes de envelhecer: iniciar a segunda já dispararia a
    // limpeza automática (ver o teste "roda sozinha").
    const velha = await entregaConcluida();
    const outra = await osDeOutroCliente('OS-T-802');
    const nova = await entregaConcluida([outra.id]);
    await encerradaHa(velha, 31);
    await encerradaHa(nova, 29);

    const r = await retencao.limparTrajetosAntigos();
    expect(r).toMatchObject({ posicoesApagadas: 1, destinosAnulados: 1 });

    expect(await prisma.posicaoEntrega.count({ where: { saidaId: velha.id } })).toBe(0);
    expect(await prisma.posicaoEntrega.count({ where: { saidaId: nova.id } })).toBe(1);
    const daVelha = await prisma.entregaOS.findFirst({ where: { saidaId: velha.id } });
    const daNova  = await prisma.entregaOS.findFirst({ where: { saidaId: nova.id } });
    expect(daVelha.destinoLat).toBeNull();
    expect(Number(daNova.destinoLat)).toBeCloseTo(Number(LAT), 6);

    // O histórico fica: status, início, fim, resultado e motivo.
    const s = await prisma.saidaEntrega.findUnique({ where: { id: velha.id } });
    expect(s.status).toBe('CONCLUIDA');
    expect(s.iniciadaEm).not.toBeNull();
    expect(s.encerradaEm).not.toBeNull();
    expect(daVelha.status).toBe('NAO_ENTREGUE');
    expect(daVelha.motivo).toBe(`${NOME} não estava em casa`);
  });

  test('saída cancelada também entra no prazo', async () => {
    const { saida } = await sair([dados.ordens.finalizado.id]);
    await (await logar(request, app, 'admin')).post(`/entregas/saidas/${saida.id}/cancelar`).send({});
    await encerradaHa(saida, 40);

    await retencao.limparTrajetosAntigos();
    expect(await prisma.posicaoEntrega.count({ where: { saidaId: saida.id } })).toBe(0);
    expect((await prisma.entregaOS.findFirst({ where: { saidaId: saida.id } })).destinoLat).toBeNull();
  });

  test('saída em rota nunca é tocada, mesmo iniciada há muito tempo', async () => {
    const { saida } = await sair([dados.ordens.finalizado.id]);
    await prisma.saidaEntrega.update({ where: { id: saida.id }, data: { iniciadaEm: dias(-60) } });

    await retencao.limparTrajetosAntigos();
    expect(await prisma.posicaoEntrega.count({ where: { saidaId: saida.id } })).toBe(1);
    expect(Number((await prisma.entregaOS.findFirst({ where: { saidaId: saida.id } })).destinoLat))
      .toBeCloseTo(Number(LAT), 6);
  });

  test('roda sozinha quando uma saída nova é iniciada', async () => {
    const velha = await entregaConcluida();
    await encerradaHa(velha, 31);

    const outra = await osDeOutroCliente('OS-T-803');
    await sair([outra.id]);
    await entregaService.aguardarGeocodificacoes();

    expect(await prisma.posicaoEntrega.count({ where: { saidaId: velha.id } })).toBe(0);
    expect((await prisma.entregaOS.findFirst({ where: { saidaId: velha.id } })).destinoLat).toBeNull();
  });

  test('a limpeza não copia de volta para o log a coordenada que está apagando', async () => {
    const velha = await entregaConcluida();
    await encerradaHa(velha, 31);
    const comCoordenada = async () => {
      await aguardarGravacoes();
      return (await prisma.logAuditoria.findMany()).filter((l) => JSON.stringify(l).includes(LAT)).length;
    };
    const antes = await comCoordenada();
    expect(antes).toBeGreaterThan(0); // o log da geocodificação, de cliente não anonimizado

    await retencao.limparTrajetosAntigos();
    expect(await comCoordenada()).toBe(antes);
  });

  test('sem nada a anular, não grava linha no log', async () => {
    const velha = await entregaConcluida();
    await encerradaHa(velha, 31);
    await retencao.limparTrajetosAntigos();
    await aguardarGravacoes();
    const antes = await prisma.logAuditoria.count();

    const r = await retencao.limparTrajetosAntigos(); // segunda passada: nada a fazer
    await aguardarGravacoes();
    expect(r).toMatchObject({ posicoesApagadas: 0, destinosAnulados: 0 });
    expect(await prisma.logAuditoria.count()).toBe(antes);
  });

  test('npm run retencao:entregas faz a mesma limpeza', async () => {
    const velha = await entregaConcluida();
    await encerradaHa(velha, 31);

    const saida = execFileSync(process.execPath, ['scripts/retencao-entregas.js'], {
      cwd: path.join(__dirname, '..', '..'), env: process.env, encoding: 'utf8',
    });
    expect(saida).toMatch(/posições apagadas: 1/);
    expect(saida).toMatch(/destinos anulados: 1/);
    expect(await prisma.posicaoEntrega.count({ where: { saidaId: velha.id } })).toBe(0);
  });
});
