require('../helpers/ambiente'); // precisa vir antes de src/app

const request = require('supertest');
const app     = require('../../src/app');
const { semear, logar, prisma } = require('../helpers/fixture');

/**
 * Módulo 4 — controle de acesso por perfil (RF022 / RF023).
 *
 * Prova o que os testes unitários não alcançam: a rota realmente barra, e a
 * tela não oferece ação que o perfil não pode executar. Acesso negado sempre
 * redireciona para /dashboard com a mensagem explicando os perfis aceitos.
 */

let dados;

beforeAll(async () => { dados = await semear(); });
afterAll(async () => { await prisma.$disconnect(); });

/** Segue o redirect e devolve o HTML final, onde a mensagem flash aparece. */
async function seguir(agente, resposta) {
  if (resposta.headers.location) return agente.get(resposta.headers.location);
  return resposta;
}

describe('acesso por perfil', () => {
  test('login válido leva ao dashboard', async () => {
    const agente = request.agent(app);
    const r = await agente.post('/login').type('form')
      .send({ login: 'admin', senha: dados.SENHA });
    expect(r.headers.location).toBe('/dashboard');
  });

  test('sem sessão, rota protegida manda para o login', async () => {
    const r = await request(app).get('/produtos');
    expect(r.headers.location).toBe('/login');
  });

  describe.each([
    ['FINANCEIRO', 'financeiro', '/produtos'],
    ['TECNICO',    'tecnico',    '/produtos'],
    ['VENDEDOR',   'vendedor',   '/financeiro'],
    ['ATENDENTE',  'atendente',  '/usuarios'],
  ])('%s não acessa %s', (_perfil, login, rota) => {
    test('é redirecionado com mensagem de acesso negado', async () => {
      const agente = await logar(request, app, login);
      const r = await agente.get(rota);
      expect(r.headers.location).toBe('/dashboard');

      const dashboard = await agente.get('/dashboard');
      expect(dashboard.text).toContain('Acesso negado');
    });
  });

  describe.each([
    ['COMPRAS',    'compras',    '/produtos'],
    ['VENDEDOR',   'vendedor',   '/produtos'],
    ['FINANCEIRO', 'financeiro', '/financeiro'],
    ['ATENDENTE',  'atendente',  '/clientes'],
    ['TECNICO',    'tecnico',    '/ordens'],
  ])('%s acessa %s', (_perfil, login, rota) => {
    test('responde 200', async () => {
      const agente = await logar(request, app, login);
      const r = await agente.get(rota);
      expect(r.status).toBe(200);
    });
  });

  test('ADMINISTRADOR passa em todas as rotas', async () => {
    const agente = await logar(request, app, 'admin');
    for (const rota of ['/clientes', '/equipamentos', '/ordens', '/produtos', '/financeiro', '/usuarios']) {
      expect((await agente.get(rota)).status).toBe(200);
    }
  });
});

describe('a tela não oferece ação que o perfil não pode executar', () => {
  test('ATENDENTE não vê formulário de orçamento nem seletor de status', async () => {
    const agente = await logar(request, app, 'atendente');
    const r = await agente.get(`/ordens/${dados.ordens.inicial.id}`);

    expect(r.text).not.toContain('name="valorOrcamento"');
    expect(r.text).not.toContain('Atualizar Status');
    expect(r.text).not.toContain('Lançar Produto na OS');
  });

  test('VENDEDOR vê lançamento de peça, mas não status nem serviço executado', async () => {
    const agente = await logar(request, app, 'vendedor');
    const r = await agente.get(`/ordens/${dados.ordens.andamento.id}`);

    expect(r.text).toContain('Lançar Produto na OS');
    expect(r.text).not.toContain('Atualizar Status');
    expect(r.text).not.toContain('name="garantiaDias"');
  });

  test('TECNICO vê status e serviço executado, mas não lançamento de peça', async () => {
    const agente = await logar(request, app, 'tecnico');
    const r = await agente.get(`/ordens/${dados.ordens.andamento.id}`);

    expect(r.text).toContain('Atualizar Status');
    expect(r.text).toContain('name="garantiaDias"');
    expect(r.text).not.toContain('Lançar Produto na OS');
  });

  test('VENDEDOR consulta o catálogo em modo leitura', async () => {
    const agente = await logar(request, app, 'vendedor');
    const lista = await agente.get('/produtos');

    expect(lista.text).not.toContain('+ Novo Produto');
    expect(lista.text).not.toContain('Desativar');

    const estoque = await agente.get(`/produtos/${dados.produtos.normal.id}/estoque`);
    expect(estoque.text).not.toContain('Registrar Movimentação');
    expect(estoque.text).toContain('Histórico de Movimentações');
  });
});

describe('bloqueio vale para o POST, não só para a tela', () => {
  test('ATENDENTE não registra orçamento por POST direto', async () => {
    const agente = await logar(request, app, 'atendente');
    const r = await agente.post(`/ordens/${dados.ordens.inicial.id}/orcamento`)
      .type('form').send({ valorOrcamento: '500', previsaoEntrega: '2026-12-01' });

    expect(r.headers.location).toBe('/dashboard');

    const ordem = await prisma.ordemServico.findUnique({ where: { id: dados.ordens.inicial.id } });
    expect(ordem.valorOrcamento).toBeNull();
  });

  test('COMPRAS não lança peça na OS por POST direto', async () => {
    const agente = await logar(request, app, 'compras');
    const r = await agente.post(`/ordens/${dados.ordens.andamento.id}/itens`)
      .type('form').send({ produtoId: String(dados.produtos.normal.id), quantidade: '1' });

    expect(r.headers.location).toBe('/dashboard');
    expect(await prisma.itemOrdem.count()).toBe(0);
  });

  test('VENDEDOR não movimenta estoque por POST direto', async () => {
    const agente = await logar(request, app, 'vendedor');
    const antes  = await prisma.movimentoEstoque.count();

    const r = await agente.post(`/produtos/${dados.produtos.normal.id}/estoque`)
      .type('form').send({ tipo: 'ENTRADA', quantidade: '5' });

    expect(r.headers.location).toBe('/dashboard');
    expect(await prisma.movimentoEstoque.count()).toBe(antes);
  });
});

/**
 * RF004 — excluir cliente é ato exclusivo do administrador.
 *
 * Esta rota não tinha teste: o caminho equivalente pela API é coberto em
 * `clientes.test.js`, mas a trava de perfil da rota web não era verificada por
 * ninguém (ver docs/MATRIZ-REQUISITOS.md, seção 4).
 */
describe('exclusão de cliente pela web (RF004)', () => {
  /** Cliente próprio: esta suíte semeia uma vez só, então não dá para mexer na massa. */
  const clienteNovo = (sufixo) => prisma.cliente.create({
    data: { nome: `Cliente RF004 ${sufixo}`, cpfCnpj: `RF004-${sufixo}-${Date.now()}` },
  });

  test('ADMINISTRADOR desativa o cliente, sem apagar o registro', async () => {
    const cliente = await clienteNovo('admin');
    const agente  = await logar(request, app, 'admin');

    const r = await agente.post(`/clientes/${cliente.id}/excluir`).type('form').send({});
    expect(r.headers.location).toBe('/clientes');

    const depois = await prisma.cliente.findUnique({ where: { id: cliente.id } });
    expect(depois).not.toBeNull();     // exclusão é lógica: o histórico depende dele
    expect(depois.ativo).toBe(false);
  });

  test.each(['atendente', 'tecnico', 'vendedor', 'financeiro', 'compras'])(
    '%s não exclui cliente, mesmo por POST direto',
    async (login) => {
      const cliente = await clienteNovo(login);
      const agente  = await logar(request, app, login);

      const r = await agente.post(`/clientes/${cliente.id}/excluir`).type('form').send({});

      expect(r.headers.location).toBe('/dashboard');
      expect((await prisma.cliente.findUnique({ where: { id: cliente.id } })).ativo).toBe(true);
    }
  );

  test('sem sessão, vai para o login e nada muda', async () => {
    const cliente = await clienteNovo('anonimo');

    const r = await request(app).post(`/clientes/${cliente.id}/excluir`).type('form').send({});

    expect(r.headers.location).toBe('/login');
    expect((await prisma.cliente.findUnique({ where: { id: cliente.id } })).ativo).toBe(true);
  });
});

/**
 * O banco aceitava dois perfis com o mesmo nome. Com `ADMINISTRADOR`
 * duplicado, parte dos usuários aponta para um e parte para o outro, e o
 * controle de acesso fica imprevisível. A restrição agora está no banco, não
 * só no código do seed.
 */
describe('nome de perfil é único no banco', () => {
  test('criar um segundo perfil com o mesmo nome é recusado', async () => {
    await expect(
      prisma.perfil.create({ data: { nomePerfil: 'ADMINISTRADOR' } })
    ).rejects.toThrow();
  });

  test('os seis perfis continuam existindo, um de cada', async () => {
    const perfis = await prisma.perfil.findMany();
    const nomes  = perfis.map((p) => p.nomePerfil);

    expect(nomes).toHaveLength(new Set(nomes).size);
    expect(new Set(nomes)).toEqual(new Set(
      ['ADMINISTRADOR', 'ATENDENTE', 'TECNICO', 'VENDEDOR', 'FINANCEIRO', 'COMPRAS']
    ));
  });
});
