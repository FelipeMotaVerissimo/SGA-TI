const request = require('supertest');
const app     = require('../../src/app');
const prisma  = require('../../src/config/database');
const jwt     = require('jsonwebtoken');

const token = () => jwt.sign(
  { id: 1, perfil: 'ADMINISTRADOR' },
  process.env.JWT_SECRET || 'secret_test',
  { expiresIn: '1h' }
);

let clienteId;

describe('API /api/clientes', () => {
  afterAll(async () => {
    if (clienteId) await prisma.cliente.deleteMany({ where: { id: clienteId } });
  });

  test('GET / retorna lista de clientes', async () => {
    const res = await request(app)
      .get('/api/clientes')
      .set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('POST / cria cliente com sucesso', async () => {
    const res = await request(app)
      .post('/api/clientes')
      .set('Authorization', `Bearer ${token()}`)
      .send({ nome: 'Cliente Teste', cpfCnpj: '999.888.777-66', email: 'ct@teste.com' });
    expect(res.status).toBe(201);
    clienteId = res.body.id;
  });

  test('POST / rejeita CPF duplicado', async () => {
    const res = await request(app)
      .post('/api/clientes')
      .set('Authorization', `Bearer ${token()}`)
      .send({ nome: 'Duplicado', cpfCnpj: '999.888.777-66' });
    expect(res.status).toBe(422);
  });

  test('GET /:id retorna cliente por ID', async () => {
    const res = await request(app)
      .get(`/api/clientes/${clienteId}`)
      .set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(200);
  });

  test('PUT /:id atualiza cliente', async () => {
    const res = await request(app)
      .put(`/api/clientes/${clienteId}`)
      .set('Authorization', `Bearer ${token()}`)
      .send({ celular: '(67) 99999-0000' });
    expect(res.status).toBe(200);
  });

  test('DELETE /:id desativa cliente', async () => {
    const res = await request(app)
      .delete(`/api/clientes/${clienteId}`)
      .set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(204);
  });

  test('GET sem token retorna 401', async () => {
    const res = await request(app).get('/api/clientes');
    expect(res.status).toBe(401);
  });
});