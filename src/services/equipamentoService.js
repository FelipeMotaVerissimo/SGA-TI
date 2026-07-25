const prisma = require('../config/database');

async function listarEquipamentos() {
  return prisma.equipamento.findMany({
    include: { cliente: true },
    orderBy: { criadoEm: 'desc' },
  });
}

async function buscarEquipamentoPorId(id) {
  const equip = await prisma.equipamento.findUnique({
    where:   { id: Number(id) },
    include: { cliente: true, ordens: true },
  });
  if (!equip) throw Object.assign(new Error('Equipamento não encontrado.'), { status: 404 });
  return equip;
}

async function buscarPorCliente(clienteId) {
  return prisma.equipamento.findMany({
    where:   { clienteId: Number(clienteId) },
    orderBy: { criadoEm: 'desc' },
  });
}

function gerarCodigo() {
  return 'EQ-' + Date.now().toString().slice(-6);
}

async function criarEquipamento(dados) {
  return prisma.equipamento.create({
    data: {
      codigo:      dados.codigo || gerarCodigo(),
      marca:       dados.marca,
      modelo:      dados.modelo,
      numeroSerie: dados.numeroSerie || null,
      defeito:     dados.defeito,
      clienteId:   Number(dados.clienteId),
    },
  });
}

async function atualizarEquipamento(id, dados) {
  await buscarEquipamentoPorId(id);
  return prisma.equipamento.update({
    where: { id: Number(id) },
    data: {
      marca:       dados.marca,
      modelo:      dados.modelo,
      numeroSerie: dados.numeroSerie || null,
      defeito:     dados.defeito,
    },
  });
}

module.exports = { listarEquipamentos, buscarEquipamentoPorId, buscarPorCliente, criarEquipamento, atualizarEquipamento };