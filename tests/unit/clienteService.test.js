jest.mock('../../src/config/database', () => ({
  cliente: {
    findMany:   jest.fn(),
    findUnique: jest.fn(),
    create:     jest.fn(),
    update:     jest.fn(),
  },
  equipamento:  { count: jest.fn() },
  contaReceber: { count: jest.fn() },
}));

const prisma         = require('../../src/config/database');
const clienteService = require('../../src/services/clienteService');

describe('clienteService', () => {
  beforeEach(() => jest.clearAllMocks());

  test('listarClientes retorna lista de clientes ativos', async () => {
    prisma.cliente.findMany.mockResolvedValue([{ id: 1, nome: 'João', ativo: true }]);
    const resultado = await clienteService.listarClientes();
    expect(resultado).toHaveLength(1);
    expect(prisma.cliente.findMany).toHaveBeenCalledWith({
      where: { ativo: true },
      orderBy: { nome: 'asc' },
    });
  });

  test('criarCliente lança erro se CPF já existir', async () => {
    prisma.cliente.findUnique.mockResolvedValue({ id: 1 });
    await expect(
      clienteService.criarCliente({ cpfCnpj: '111.111.111-11' })
    ).rejects.toThrow('CPF/CNPJ já cadastrado.');
  });

  test('criarCliente cria e retorna cliente novo', async () => {
    prisma.cliente.findUnique.mockResolvedValue(null);
    prisma.cliente.create.mockResolvedValue({ id: 2, nome: 'Maria' });
    const resultado = await clienteService.criarCliente({ nome: 'Maria', cpfCnpj: '222.222.222-22' });
    expect(resultado.nome).toBe('Maria');
  });

  test('buscarClientePorId lança erro se não encontrar', async () => {
    prisma.cliente.findUnique.mockResolvedValue(null);
    await expect(
      clienteService.buscarClientePorId(999)
    ).rejects.toThrow('Cliente não encontrado.');
  });

  test('excluirCliente realiza soft delete', async () => {
    prisma.cliente.findUnique.mockResolvedValue({ id: 1, ativo: true });
    prisma.equipamento.count.mockResolvedValue(0);
    prisma.contaReceber.count.mockResolvedValue(0);
    prisma.cliente.update.mockResolvedValue({ id: 1, ativo: false });
    await clienteService.excluirCliente(1);
    expect(prisma.cliente.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data:  { ativo: false },
    });
  });

  // Regra desde 3e859a0 (12/11/2026): cliente com equipamento/OS ou conta a
  // receber não pode ser excluído.
  test.each([
    ['equipamento', 1, 0],
    ['conta a receber', 0, 1],
  ])('excluirCliente recusa cliente com %s vinculado', async (_, equip, contas) => {
    prisma.cliente.findUnique.mockResolvedValue({ id: 1, ativo: true });
    prisma.equipamento.count.mockResolvedValue(equip);
    prisma.contaReceber.count.mockResolvedValue(contas);
    await expect(clienteService.excluirCliente(1))
      .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/Não é possível excluir/) });
    expect(prisma.cliente.update).not.toHaveBeenCalled();
  });
});
