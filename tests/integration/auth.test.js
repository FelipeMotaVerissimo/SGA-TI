require('../helpers/ambiente'); // isola o banco de teste do dev.db

const request = require('supertest');
const jwt     = require('jsonwebtoken');
const app     = require('../../src/app');
const { semear, prisma } = require('../helpers/fixture');

/**
 * POST /api/auth/login — autenticação da API por token.
 *
 * Este arquivo falhou desde antes da consolidação dos módulos: tinha sido
 * escrito contra um schema que nunca existiu neste projeto, com `usuario.email`
 * e `usuario.perfil` em texto. O model real tem `login` e `perfilId` (relação
 * com `Perfil`). A rota sempre funcionou; o teste é que não conseguia nem
 * montar o cenário. Reescrito em outubro de 2026 contra o schema real, mantendo
 * os três casos que o original pretendia cobrir.
 *
 * Usa a massa da fixture, como os demais testes de integração — o que também
 * zera o limite de tentativas de login entre as suítes.
 */

let dados;

beforeEach(async () => { dados = await semear(); });
afterAll(async () => { await prisma.$disconnect(); });

const entrar = (corpo) => request(app).post('/api/auth/login').send(corpo);

describe('POST /api/auth/login', () => {
  test('retorna token para credenciais válidas', async () => {
    const res = await entrar({ login: 'admin', senha: dados.SENHA });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.usuario).toMatchObject({ login: 'admin', perfil: 'ADMINISTRADOR' });
  });

  test('o token carrega o id e o perfil do usuário, e nada mais sensível', async () => {
    const res = await entrar({ login: 'tecnico', senha: dados.SENHA });
    const conteudo = jwt.verify(res.body.token, process.env.JWT_SECRET);

    expect(conteudo.id).toBe(dados.usuarios.tecnico.id);
    expect(conteudo.perfil).toBe('TECNICO');
    expect(conteudo.senha).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain(dados.SENHA);
  });

  test('retorna 401 para senha incorreta', async () => {
    const res = await entrar({ login: 'admin', senha: 'senha-errada' });

    expect(res.status).toBe(401);
    expect(res.body.token).toBeUndefined();
  });

  test('login inexistente recebe a MESMA resposta da senha errada', async () => {
    // Responder diferente entre "usuário não existe" e "senha errada" deixaria
    // descobrir quais logins existem no sistema.
    const inexistente = await entrar({ login: 'ninguem', senha: dados.SENHA });
    const senhaErrada = await entrar({ login: 'admin', senha: 'senha-errada' });

    expect(inexistente.status).toBe(401);
    expect(inexistente.body).toEqual(senhaErrada.body);
  });

  test('usuário desativado não entra, mesmo com a senha certa', async () => {
    await prisma.usuario.update({
      where: { id: dados.usuarios.vendedor.id },
      data:  { ativo: false },
    });

    const res = await entrar({ login: 'vendedor', senha: dados.SENHA });

    expect(res.status).toBe(401);
  });

  test.each([
    ['sem senha',     { login: 'admin' }],
    ['sem login',     { senha: 'qualquer' }],
    ['corpo vazio',   {}],
  ])('retorna 400 para campos ausentes — %s', async (_caso, corpo) => {
    const res = await entrar(corpo);

    expect(res.status).toBe(400);
  });

  test('aceita `email` como sinônimo de `login`, por compatibilidade', async () => {
    // O controller aceita os dois nomes para não quebrar quem já chamava a API
    // com `email` (ver authController.login).
    const res = await entrar({ email: 'admin', senha: dados.SENHA });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });
});
