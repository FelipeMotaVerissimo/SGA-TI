const request = require('supertest');
const app     = require('../../src/app');
const prisma  = require('../../src/config/database');
const bcrypt  = require('bcrypt');

describe('POST /api/auth/login', () => {
  beforeAll(async () => {
    const senhaHash = await bcrypt.hash('senha123', 10);
    await prisma.usuario.upsert({
      where:  { email: 'teste@sgati.com' },
      update: {},
      create: {
        nome:   'Usuário Teste',
        email:  'teste@sgati.com',
        senha:  senhaHash,
        perfil: 'ADMINISTRADOR',
      },
    });
  });

  afterAll(async () => {
    await prisma.usuario.deleteMany({ where: { email: 'teste@sgati.com' } });
  });

  test('retorna token para credenciais válidas', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'teste@sgati.com', senha: 'senha123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  test('retorna 401 para senha incorreta', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'teste@sgati.com', senha: 'errada' });
    expect(res.status).toBe(401);
  });

  test('retorna 400 para campos ausentes', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'teste@sgati.com' });
    expect(res.status).toBe(400);
  });
});