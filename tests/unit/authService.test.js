jest.mock('../../src/config/database', () => ({
  usuario: { findUnique: jest.fn(), create: jest.fn() },
}));
jest.mock('bcrypt');
jest.mock('jsonwebtoken');

const prisma      = require('../../src/config/database');
const bcrypt      = require('bcrypt');
const jwt         = require('jsonwebtoken');
const authService = require('../../src/services/authService');

describe('authService', () => {
  beforeEach(() => jest.clearAllMocks());

  test('login retorna token para credenciais válidas', async () => {
    prisma.usuario.findUnique.mockResolvedValue({
      id: 1, nome: 'Admin', email: 'a@b.com',
      senha: 'hash', perfil: 'ADMINISTRADOR', ativo: true,
    });
    bcrypt.compare.mockResolvedValue(true);
    jwt.sign.mockReturnValue('token_gerado');
    const resultado = await authService.login('a@b.com', '123');
    expect(resultado.token).toBe('token_gerado');
  });

  test('login lança erro para senha incorreta', async () => {
    prisma.usuario.findUnique.mockResolvedValue({
      id: 1, senha: 'hash', ativo: true,
    });
    bcrypt.compare.mockResolvedValue(false);
    await expect(
      authService.login('a@b.com', 'errada')
    ).rejects.toThrow('Credenciais inválidas.');
  });

  test('login lança erro para usuário inativo', async () => {
    prisma.usuario.findUnique.mockResolvedValue({ id: 1, ativo: false });
    await expect(
      authService.login('a@b.com', '123')
    ).rejects.toThrow('Credenciais inválidas.');
  });
});