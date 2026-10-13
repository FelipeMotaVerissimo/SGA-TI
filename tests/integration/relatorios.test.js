require('../helpers/ambiente'); // precisa vir antes de src/app

const request = require('supertest');
const app     = require('../../src/app');
const { semear, logar, dias, prisma } = require('../helpers/fixture');

/**
 * Módulo 5 — Relatórios gerenciais (UC RF008).
 *
 * O que os unitários não provam: o período chega pela query string, o perfil
 * gerencial é exigido, e os números que aparecem na tela vêm mesmo do banco.
 */

let dados;

beforeEach(async () => { dados = await semear(); });
afterAll(async () => { await prisma.$disconnect(); });

/** Extrai o texto da tela sem as tags, para procurar valores. */
const texto = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('acesso ao relatório', () => {
  test('o link da sidebar não é mais um 404', async () => {
    const agente = await logar(request, app, 'admin');
    expect((await agente.get('/relatorios')).status).toBe(200);
  });

  test.each(['financeiro', 'compras', 'vendedor', 'tecnico', 'atendente'])(
    '%s não acessa relatórios — é permissão gerencial',
    async (login) => {
      const agente = await logar(request, app, login);
      const r = await agente.get('/relatorios');

      expect(r.headers.location).toBe('/dashboard');
    }
  );

  test('sem sessão, vai para o login', async () => {
    const r = await request(app).get('/relatorios');
    expect(r.headers.location).toBe('/login');
  });
});

describe('período (UC RF008: "período e filtros desejados")', () => {
  test('sem filtro, mostra o padrão de 30 dias', async () => {
    const agente = await logar(request, app, 'admin');
    const r = await agente.get('/relatorios');

    expect(texto(r.text)).toContain('Período analisado');
  });

  test('o período informado é respeitado e devolvido no formulário', async () => {
    const agente = await logar(request, app, 'admin');
    const r = await agente.get('/relatorios?de=2026-08-01&ate=2026-08-31');

    expect(r.text).toContain('value="2026-08-01"');
    expect(r.text).toContain('value="2026-08-31"');
    expect(texto(r.text)).toContain('01/08/2026');
    expect(texto(r.text)).toContain('31/08/2026');
  });

  test('período invertido não quebra a tela: volta ao padrão com aviso', async () => {
    const agente = await logar(request, app, 'admin');

    const r = await agente.get('/relatorios?de=2026-12-01&ate=2026-01-01');
    expect(r.headers.location).toBe('/relatorios');

    const tela = await agente.get('/relatorios');
    expect(tela.status).toBe(200);
    expect(tela.text).toContain('data inicial não pode ser maior');
  });
});

describe('RF016 — maiores clientes', () => {
  test('soma os orçamentos do cliente e ignora a OS cancelada', async () => {
    const agente = await logar(request, app, 'admin');
    const r = await agente.get('/relatorios');
    const conteudo = texto(r.text);

    // fixture: ORCAMENTO 320 + AUTORIZADO 450 + EM_ANDAMENTO 890 + FINALIZADO 260
    // = 1920 para o mesmo cliente. A OS CANCELADA não tem orçamento e não soma.
    expect(conteudo).toContain('Cliente de Teste');
    expect(conteudo).toContain('R$ 1920.00');
  });

  test('a coluna de aprovado separa proposta de venda confirmada', async () => {
    const agente = await logar(request, app, 'admin');
    const conteudo = texto((await agente.get('/relatorios')).text);

    // aprovados = AUTORIZADO 450 + EM_ANDAMENTO 890 + FINALIZADO 260 = 1600
    // (os 320 em ORCAMENTO ainda são proposta)
    expect(conteudo).toContain('R$ 1600.00');
  });

  test('OS fora do período não entra na conta', async () => {
    const agente = await logar(request, app, 'admin');

    // joga tudo para um ano atrás e consulta só os últimos 30 dias
    await prisma.ordemServico.updateMany({ data: { dataAbertura: dias(-365) } });

    const conteudo = texto((await agente.get('/relatorios')).text);
    expect(conteudo).toContain('Nenhuma ordem de serviço no período');
  });
});

describe('RF018 — produtos mais vendidos', () => {
  test('agrupa as peças lançadas no período', async () => {
    const vendedor = await logar(request, app, 'vendedor');
    await vendedor.post(`/ordens/${dados.ordens.andamento.id}/itens`).type('form')
      .send({ produtoId: String(dados.produtos.normal.id), quantidade: '3' });

    const admin = await logar(request, app, 'admin');
    const conteudo = texto((await admin.get('/relatorios')).text);

    expect(conteudo).toContain('Peça com estoque');
    expect(conteudo).toContain('R$ 300.00');   // 3 x R$ 100,00
  });

  test('soma lançamentos separados do mesmo produto', async () => {
    const vendedor = await logar(request, app, 'vendedor');
    const url = `/ordens/${dados.ordens.andamento.id}/itens`;

    await vendedor.post(url).type('form')
      .send({ produtoId: String(dados.produtos.normal.id), quantidade: '2' });
    await vendedor.post(url).type('form')
      .send({ produtoId: String(dados.produtos.normal.id), quantidade: '4' });

    const admin = await logar(request, app, 'admin');
    const conteudo = texto((await admin.get('/relatorios')).text);

    expect(conteudo).toContain('6 un.');
    expect(conteudo).toContain('R$ 600.00');
  });

  test('peça lançada fora do período não aparece', async () => {
    const vendedor = await logar(request, app, 'vendedor');
    await vendedor.post(`/ordens/${dados.ordens.andamento.id}/itens`).type('form')
      .send({ produtoId: String(dados.produtos.normal.id), quantidade: '3' });

    await prisma.itemOrdem.updateMany({ data: { criadoEm: dias(-365) } });

    const admin = await logar(request, app, 'admin');
    const conteudo = texto((await admin.get('/relatorios')).text);

    expect(conteudo).toContain('Nenhuma peça lançada no período');
  });

  test('sem venda nenhuma, a tela carrega vazia sem erro', async () => {
    const agente = await logar(request, app, 'admin');
    const r = await agente.get('/relatorios');

    expect(r.status).toBe(200);
    expect(texto(r.text)).toContain('Nenhuma peça lançada no período');
  });
});

/**
 * NF004 — análise geográfica, de ponta a ponta.
 */
describe('demanda por região (NF004)', () => {
  test('a tela traz o bloco e a cidade do cliente da massa', async () => {
    const agente = await logar(request, app, 'admin');
    const res    = await agente.get('/relatorios');

    expect(res.status).toBe(200);
    expect(res.text).toContain('Demanda por Região');
    expect(res.text).toContain('Dourados'); // cidade do cliente da fixture
  });

  test('cliente sem cidade aparece como Não informado', async () => {
    // Um segundo cliente, sem cidade, com equipamento e OS próprios.
    const cliente = await prisma.cliente.create({
      data: { nome: 'Cliente Sem Cidade', cpfCnpj: 'NF004-001' },
    });
    const equipamento = await prisma.equipamento.create({
      data: {
        codigo: 'EQ-NF004', tipo: 'DESKTOP', marca: 'Generica', modelo: 'X',
        defeito: 'Teste NF004', clienteId: cliente.id,
      },
    });
    await prisma.ordemServico.create({
      data: {
        numero: 'OS-NF004-1', status: 'FINALIZADO', defeitoRelatado: 'Teste',
        valorOrcamento: 700, equipamentoId: equipamento.id,
        usuarioId: dados.usuarios.atendente.id,
      },
    });

    const agente = await logar(request, app, 'admin');
    const res    = await agente.get('/relatorios');

    expect(res.text).toContain('Não informado');
  });

  test('exporta o CSV da região', async () => {
    const agente = await logar(request, app, 'admin');
    const res    = await agente.get('/relatorios/regiao/csv');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/csv/);
    expect(res.headers['content-disposition']).toMatch(/por-regiao/);
    expect(res.text).toContain('Cidade;UF;Clientes;Ordens');
  });

  test('só perfil gerencial acessa', async () => {
    const agente = await logar(request, app, 'atendente');
    const res    = await agente.get('/relatorios/regiao/csv');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/dashboard');
  });
});
