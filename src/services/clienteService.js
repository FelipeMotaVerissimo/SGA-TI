const prisma = require('../config/database');

async function listarClientes() {
  return prisma.cliente.findMany({ where: { ativo: true }, orderBy: { nome: 'asc' } });
}

async function buscarClientePorId(id) {
  const idNum = Number(id);
  if (!idNum) throw Object.assign(new Error('ID inválido.'), { status: 400 });
  const cliente = await prisma.cliente.findUnique({
    where:   { id: idNum },
    include: { equipamentos: true },
  });
  if (!cliente) throw Object.assign(new Error('Cliente não encontrado.'), { status: 404 });
  return cliente;
}

async function criarCliente(dados) {
  const existente = await prisma.cliente.findUnique({ where: { cpfCnpj: dados.cpfCnpj } });
  if (existente) throw Object.assign(new Error('CPF/CNPJ já cadastrado.'), { status: 422 });
  return prisma.cliente.create({
    data: {
      nome:           dados.nome,
      cpfCnpj:        dados.cpfCnpj,
      rg:             dados.rg             || null,
      dataNascimento: dados.dataNascimento  ? new Date(dados.dataNascimento) : null,
      endereco:       dados.endereco       || null,
      numero:         dados.numero         || null,
      bairro:         dados.bairro         || null,
      cidade:         dados.cidade         || null,
      estado:         dados.estado         || null,
      cep:            dados.cep            || null,
      telefone:       dados.telefone       || null,
      celular:        dados.celular        || null,
      email:          dados.email          || null,
    },
  });
}

/**
 * Atualiza o cliente montando o `data` campo a campo, como em criarCliente.
 *
 * Repassar o `req.body` inteiro para o Prisma quebrava a edição: o formulário
 * envia campos que não existem no model (o `bairro`, por exemplo) e o MySQL
 * respondia `Unknown argument`. Listar os campos aqui também impede que um POST
 * manipulado altere colunas que a tela não oferece.
 */
async function atualizarCliente(id, dados) {
  await buscarClientePorId(id);

  const permitidos = [
    'nome', 'cpfCnpj', 'rg', 'endereco', 'numero', 'bairro',
    'cidade', 'estado', 'cep', 'telefone', 'celular', 'email',
  ];

  const data = {};
  for (const campo of permitidos) {
    if (dados[campo] !== undefined) data[campo] = dados[campo] || null;
  }
  if (dados.nome    !== undefined) data.nome    = dados.nome;
  if (dados.cpfCnpj !== undefined) data.cpfCnpj = dados.cpfCnpj;

  if (dados.dataNascimento !== undefined) {
    data.dataNascimento = dados.dataNascimento ? new Date(dados.dataNascimento) : null;
  }

  return prisma.cliente.update({ where: { id: Number(id) }, data });
}

async function excluirCliente(id) {
  await buscarClientePorId(id);
  return prisma.cliente.update({ where: { id: Number(id) }, data: { ativo: false } });
}

module.exports = { listarClientes, buscarClientePorId, criarCliente, atualizarCliente, excluirCliente };