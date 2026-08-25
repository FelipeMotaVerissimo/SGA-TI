require('../helpers/ambiente'); // precisa vir antes de src/app

const request = require('supertest');
const jwt     = require('jsonwebtoken');
const app     = require('../../src/app');
const { semear, prisma } = require('../helpers/fixture');

/**
 * Módulo 4 — API REST de produtos e financeiro.
 *
 * As telas web usam sessão; a API usa JWT. São dois caminhos diferentes para as
 * mesmas regras, então os dois precisam recusar quem não tem perfil.
 */

let dados;

beforeEach(async () => { dados = await semear(); });
afterAll(async () => { await prisma.$disconnect(); });

/** Login da fixture correspondente a cada perfil. */
const LOGIN_DO_PERFIL = {
  ADMINISTRADOR: 'admin',
  ATENDENTE:     'atendente',
  TECNICO:       'tecnico',
  VENDEDOR:      'vendedor',
  FINANCEIRO:    'financeiro',
  COMPRAS:       'compras',
};

/**
 * Token do mesmo formato que o authService emite no login.
 *
 * O id precisa ser de um usuário que existe: rotas que gravam autoria
 * (movimentação de estoque, baixa de conta) têm chave estrangeira para
 * `usuarios`, e um id inventado estoura no banco.
 */
const token = (perfil, id) => jwt.sign(
  { id: id || dados.usuarios[LOGIN_DO_PERFIL[perfil]].id, perfil },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);

const comToken = (req, perfil, id) => req.set('Authorization', `Bearer ${token(perfil, id)}`);

describe('autenticação da API', () => {
  test.each([
    ['/api/produtos'],
    ['/api/financeiro/pagar'],
  ])('%s sem token devolve 401', async (rota) => {
    const r = await request(app).get(rota);
    expect(r.status).toBe(401);
    expect(r.body.erro).toMatch(/Token/);
  });

  test('token inválido devolve 401', async () => {
    const r = await request(app).get('/api/produtos')
      .set('Authorization', 'Bearer token-inventado');
    expect(r.status).toBe(401);
  });
});

describe('API de produtos (RF014 / RF015)', () => {
  test('COMPRAS lista os produtos ativos', async () => {
    const r = await comToken(request(app).get('/api/produtos'), 'COMPRAS');

    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
    expect(r.body.map((p) => p.nome)).toContain('Peça com estoque');
    expect(r.body.map((p) => p.nome)).not.toContain('Peça descontinuada'); // inativo
  });

  test('filtro de inativos funciona pela query', async () => {
    const r = await comToken(request(app).get('/api/produtos?inativos=1'), 'COMPRAS');
    expect(r.body.map((p) => p.nome)).toContain('Peça descontinuada');
  });

  test('COMPRAS cria produto e recebe 201', async () => {
    const r = await comToken(request(app).post('/api/produtos'), 'COMPRAS')
      .send({ nome: 'Peça via API', preco: '99,90', estoque: 3 });

    expect(r.status).toBe(201);
    expect(r.body.id).toBeDefined();
    expect(Number(r.body.preco)).toBe(99.9);

    const movimentos = await prisma.movimentoEstoque.findMany({ where: { produtoId: r.body.id } });
    expect(movimentos).toHaveLength(1);
    expect(movimentos[0].tipo).toBe('ENTRADA');
  });

  test('erro de validação vira status do service, não 500', async () => {
    const r = await comToken(request(app).post('/api/produtos'), 'COMPRAS')
      .send({ nome: 'Sem preço' });

    expect(r.status).toBe(400);
    expect(r.body.erro).toMatch(/Informe o preço/);
  });

  test('nome duplicado devolve 422', async () => {
    const r = await comToken(request(app).post('/api/produtos'), 'COMPRAS')
      .send({ nome: dados.produtos.normal.nome, preco: '10' });

    expect(r.status).toBe(422);
  });

  test('produto inexistente devolve 404', async () => {
    const r = await comToken(request(app).get('/api/produtos/99999'), 'COMPRAS');
    expect(r.status).toBe(404);
  });

  test('movimentação pela API ajusta o saldo e devolve o aviso', async () => {
    const r = await comToken(
      request(app).post(`/api/produtos/${dados.produtos.zerado.id}/movimentos`), 'COMPRAS'
    ).send({ tipo: 'SAIDA', quantidade: 3 });

    expect(r.status).toBe(201);
    expect(r.body.produto.estoque).toBe(-3);
    expect(r.body.aviso).toMatch(/ficou negativo/);
  });

  test('entrada sem saldo negativo não traz aviso', async () => {
    const r = await comToken(
      request(app).post(`/api/produtos/${dados.produtos.normal.id}/movimentos`), 'COMPRAS'
    ).send({ tipo: 'ENTRADA', quantidade: 5 });

    expect(r.body.produto.estoque).toBe(15);
    expect(r.body.aviso).toBeNull();
  });

  test('histórico de movimentações vem com o autor', async () => {
    await comToken(
      request(app).post(`/api/produtos/${dados.produtos.normal.id}/movimentos`), 'COMPRAS', dados.usuarios.compras.id
    ).send({ tipo: 'ENTRADA', quantidade: 1 });

    const r = await comToken(
      request(app).get(`/api/produtos/${dados.produtos.normal.id}/movimentos`), 'COMPRAS'
    );

    expect(r.status).toBe(200);
    expect(r.body[0].usuario.nome).toBe('Usuario compras');
  });

  test('VENDEDOR consulta mas não escreve', async () => {
    expect((await comToken(request(app).get('/api/produtos'), 'VENDEDOR')).status).toBe(200);

    const r = await comToken(request(app).post('/api/produtos'), 'VENDEDOR')
      .send({ nome: 'Tentativa', preco: '10' });

    expect(r.status).toBe(403);
    expect(r.body.perfisAutorizados).toContain('COMPRAS');
  });

  test('FINANCEIRO não acessa produtos', async () => {
    const r = await comToken(request(app).get('/api/produtos'), 'FINANCEIRO');
    expect(r.status).toBe(403);
  });

  test('ADMINISTRADOR passa em tudo', async () => {
    expect((await comToken(request(app).get('/api/produtos'), 'ADMINISTRADOR')).status).toBe(200);

    const r = await comToken(request(app).post('/api/produtos'), 'ADMINISTRADOR')
      .send({ nome: 'Peça do admin', preco: '10' });
    expect(r.status).toBe(201);
  });

  test('exclusão é lógica e devolve 204', async () => {
    const r = await comToken(
      request(app).delete(`/api/produtos/${dados.produtos.normal.id}`), 'COMPRAS'
    );

    expect(r.status).toBe(204);
    const produto = await prisma.produto.findUnique({ where: { id: dados.produtos.normal.id } });
    expect(produto.ativo).toBe(false);
  });
});

describe('API do financeiro (RF020 / RF021)', () => {
  test('lista contas a pagar e a receber', async () => {
    const pagar   = await comToken(request(app).get('/api/financeiro/pagar'), 'FINANCEIRO');
    const receber = await comToken(request(app).get('/api/financeiro/receber'), 'FINANCEIRO');

    expect(pagar.status).toBe(200);
    expect(pagar.body[0].descricao).toBe('Conta a pagar aberta');
    expect(receber.body[0].descricao).toBe('Conta a receber aberta');
  });

  test('tipo inválido devolve 404', async () => {
    const r = await comToken(request(app).get('/api/financeiro/salario'), 'FINANCEIRO');
    expect(r.status).toBe(404);
  });

  test('cria conta a pagar e devolve 201', async () => {
    const r = await comToken(request(app).post('/api/financeiro/pagar'), 'FINANCEIRO')
      .send({ descricao: 'Conta via API', valor: '250,50', vencimento: '2026-12-10' });

    expect(r.status).toBe(201);
    expect(Number(r.body.valor)).toBe(250.5);
  });

  test('validação devolve 400 com a mensagem do service', async () => {
    const r = await comToken(request(app).post('/api/financeiro/pagar'), 'FINANCEIRO')
      .send({ descricao: 'Sem valor', vencimento: '2026-12-10' });

    expect(r.status).toBe(400);
    expect(r.body.erro).toMatch(/Informe o valor/);
  });

  test('quitar registra quem deu a baixa', async () => {
    const r = await comToken(
      request(app).post(`/api/financeiro/pagar/${dados.contas.pagarAberta.id}/quitar`),
      'FINANCEIRO', dados.usuarios.financeiro.id
    );

    expect(r.status).toBe(200);
    expect(r.body.situacao).toBe('PAGA');
    expect(r.body.quitadaPorId).toBe(dados.usuarios.financeiro.id);
  });

  test('quitar conta já paga devolve 400', async () => {
    const url = `/api/financeiro/pagar/${dados.contas.pagarAberta.id}/quitar`;
    await comToken(request(app).post(url), 'FINANCEIRO');

    const r = await comToken(request(app).post(url), 'FINANCEIRO');
    expect(r.status).toBe(400);
    expect(r.body.erro).toMatch(/Só é possível quitar/);
  });

  test('resumo devolve os totais em aberto', async () => {
    const r = await comToken(request(app).get('/api/financeiro/resumo'), 'FINANCEIRO');

    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ aPagar: 1000, aReceber: 300, saldo: -700 });
  });

  test('COMPRAS não acessa o financeiro', async () => {
    const r = await comToken(request(app).get('/api/financeiro/pagar'), 'COMPRAS');
    expect(r.status).toBe(403);
  });
});
