const prisma = require('../config/database');

/**
 * Módulo 5 — tipos de equipamento, a granularidade do RF019.
 * OUTRO é o default: equipamento sem classificação não pode travar o cadastro,
 * e é melhor que o relatório mostre "Outro" do que um tipo inventado.
 */
const TIPOS_EQUIPAMENTO = ['NOTEBOOK', 'DESKTOP', 'IMPRESSORA', 'SERVIDOR', 'CELULAR', 'OUTRO'];
const TIPO_PADRAO = 'OUTRO';

function validarTipo(bruto) {
  const tipo = String(bruto || '').trim().toUpperCase();
  if (!tipo) return TIPO_PADRAO;

  if (!TIPOS_EQUIPAMENTO.includes(tipo)) {
    throw Object.assign(
      new Error(`Tipo de equipamento inválido. Use um destes: ${TIPOS_EQUIPAMENTO.join(', ')}.`),
      { status: 400 }
    );
  }
  return tipo;
}

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
      tipo:        validarTipo(dados.tipo),
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
      tipo:        validarTipo(dados.tipo),
      marca:       dados.marca,
      modelo:      dados.modelo,
      numeroSerie: dados.numeroSerie || null,
      defeito:     dados.defeito,
    },
  });
}

module.exports = {
  TIPOS_EQUIPAMENTO,
  TIPO_PADRAO,
  validarTipo, listarEquipamentos, buscarEquipamentoPorId, buscarPorCliente, criarEquipamento, atualizarEquipamento };