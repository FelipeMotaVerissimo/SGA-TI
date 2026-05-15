const prisma = require('../config/database');

async function listarClientes() {
  return prisma.cliente.findMany({ where: { ativo: true }, orderBy: { nome: 'asc' } });
}

async function buscarClientePorId(id) {
  const cliente = await prisma.cliente.findUnique({
    where: { id: Number(id) },
    include: { equipamentos: true },
  });
  if (!cliente) throw Object.assign(new Error('Cliente não encontrado.'), { status: 404 });
  return cliente;
}

async function criarCliente(dados) {
  const existente = await prisma.cliente.findUnique({ where: { cpfCnpj: dados.cpfCnpj } });
  if (existente) throw Object.assign(new Error('CPF/CNPJ já cadastrado.'), { status: 422 });
  return prisma.cliente.create({ data: dados });
}

async function atualizarCliente(id, dados) {
  await buscarClientePorId(id);
  return prisma.cliente.update({ where: { id: Number(id) }, data: dados });
}

async function excluirCliente(id) {
  await buscarClientePorId(id);
  return prisma.cliente.update({ where: { id: Number(id) }, data: { ativo: false } });
}

module.exports = { listarClientes, buscarClientePorId, criarCliente, atualizarCliente, excluirCliente };