require('../helpers/ambiente'); // precisa vir antes de src/app

const request = require('supertest');
const app     = require('../../src/app');
const { semear, logar, prisma } = require('../helpers/fixture');

/**
 * Módulo 5 — dashboards de acompanhamento e exportação (UC RF008).
 *
 * O ponto sensível do dashboard não são os números: é que cada bloco só
 * apareça para quem tem perfil de ver aquele dado. O caixa da empresa não
 * pode aparecer para o técnico.
 */

let dados;

beforeEach(async () => { dados = await semear(); });
afterAll(async () => { await prisma.$disconnect(); });

const BLOCOS = {
  os:         '📋 Ordens de Serviço</h2>',
  financeiro: '💰 Financeiro</h2>',
  estoque:    '📦 Estoque</h2>',
  garantias:  '🛡️ Garantias</h2>',
};

async function blocos(login) {
  const agente = await logar(request, app, login);
  const html = (await agente.get('/dashboard')).text;

  return Object.entries(BLOCOS).reduce((acc, [nome, marca]) => {
    acc[nome] = html.includes(marca);
    return acc;
  }, {});
}

describe('blocos por perfil', () => {
  test('ADMINISTRADOR vê tudo', async () => {
    expect(await blocos('admin')).toEqual({
      os: true, financeiro: true, estoque: true, garantias: true,
    });
  });

  test('FINANCEIRO vê o caixa, não o estoque', async () => {
    expect(await blocos('financeiro')).toEqual({
      os: true, financeiro: true, estoque: false, garantias: false,
    });
  });

  test('COMPRAS vê o estoque, não o caixa', async () => {
    expect(await blocos('compras')).toEqual({
      os: true, financeiro: false, estoque: true, garantias: false,
    });
  });

  test('TECNICO vê as garantias, e nenhum número financeiro', async () => {
    expect(await blocos('tecnico')).toEqual({
      os: true, financeiro: false, estoque: false, garantias: true,
    });
  });

  test('ATENDENTE vê só as ordens de serviço', async () => {
    expect(await blocos('atendente')).toEqual({
      os: true, financeiro: false, estoque: false, garantias: false,
    });
  });
});

describe('indicadores', () => {
  test('conta as OS por situação', async () => {
    const agente = await logar(request, app, 'admin');
    const html = (await agente.get('/dashboard')).text;
    const texto = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

    // fixture: INICIAL, ORCAMENTO, AUTORIZADO, EM_ANDAMENTO = 4 abertas
    expect(texto).toMatch(/4\s+OS Abertas/);
    expect(texto).toMatch(/1\s+Aguardando Orçamento/);
    expect(texto).toMatch(/1\s+Em Andamento/);
  });

  test('mostra o saldo negativo do estoque e o link para regularizar', async () => {
    const compras = await logar(request, app, 'compras');
    await compras.post(`/produtos/${dados.produtos.zerado.id}/estoque`).type('form')
      .send({ tipo: 'SAIDA', quantidade: '3' });

    const html = (await compras.get('/dashboard')).text;

    expect(html).toContain('Com saldo negativo');
    expect(html).toContain('A regularizar');
    expect(html).toContain(`/produtos/${dados.produtos.zerado.id}/estoque`);
  });

  test('a tabela de OS recentes traz dados reais, não o texto de vazio', async () => {
    const agente = await logar(request, app, 'admin');
    const html = (await agente.get('/dashboard')).text;

    expect(html).toContain(dados.ordens.andamento.numero);
    expect(html).not.toContain('Nenhuma ordem de serviço cadastrada ainda');
  });
});

describe('exportação em CSV', () => {
  test.each(['clientes', 'produtos', 'servicos', 'equipamentos'])(
    'o relatório %s exporta com cabeçalho de download',
    async (relatorio) => {
      const agente = await logar(request, app, 'admin');
      const r = await agente.get(`/relatorios/${relatorio}/csv`);

      expect(r.status).toBe(200);
      expect(r.headers['content-type']).toContain('text/csv');
      expect(r.headers['content-disposition']).toContain('attachment');
      expect(r.headers['content-disposition']).toContain('.csv');
    }
  );

  test('o conteúdo bate com o relatório da tela', async () => {
    const agente = await logar(request, app, 'admin');
    const r = await agente.get('/relatorios/clientes/csv');
    const linhas = r.text.replace(/^﻿/, '').trim().split('\r\n');

    expect(linhas[0]).toBe('Cliente;CPF/CNPJ;Ordens;Total Orçado;Já Aprovado;Ticket Médio');
    expect(linhas[1]).toContain('Cliente de Teste');
    expect(linhas[1]).toContain('1920,00');  // decimal com vírgula, para o Excel
  });

  test('o nome do arquivo carrega o período consultado', async () => {
    const agente = await logar(request, app, 'admin');
    const r = await agente.get('/relatorios/produtos/csv?de=2026-06-01&ate=2026-12-31');

    expect(r.headers['content-disposition'])
      .toContain('produtos-mais-vendidos_2026-06-01_a_2026-12-31.csv');
  });

  test('relatório inexistente volta para a tela com aviso, sem baixar nada', async () => {
    const agente = await logar(request, app, 'admin');
    const r = await agente.get('/relatorios/inventado/csv');

    expect(r.headers.location).toBe('/relatorios');

    const tela = await agente.get('/relatorios');
    expect(tela.text).toContain('Relatório não encontrado');
  });

  test('exportar também é permissão gerencial', async () => {
    const agente = await logar(request, app, 'financeiro');
    const r = await agente.get('/relatorios/clientes/csv');

    expect(r.headers.location).toBe('/dashboard');
  });
});
