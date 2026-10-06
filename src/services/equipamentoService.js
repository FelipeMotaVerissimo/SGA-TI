const prisma = require('../config/database');
const { calcularGarantia } = require('./servicoExecutadoService');

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

/**
 * RF012 — histórico de serviços por equipamento.
 *
 * Granularidade: **uma linha por serviço executado**, reunindo todas as OS do
 * equipamento. É a pergunta do balcão — "o que já foi feito nesta máquina?" —
 * e não "quais OS ela teve"; por isso o serviço é a unidade, não a ordem.
 *
 * Até aqui esse histórico só existia dentro de cada OS: para saber se uma peça
 * já tinha sido trocada, era preciso abrir uma OS de cada vez e comparar de
 * cabeça (pendência P07 dos Módulos 3 e 4).
 *
 * Regras:
 *  - RN01: a lista é ordenada pela data de execução, mais recente primeiro,
 *    atravessando as OS — a ordem cronológica do equipamento é o que importa,
 *    não o agrupamento por ordem de serviço.
 *  - RN02: serviço de OS CANCELADO **continua** no histórico. Ele foi mesmo
 *    executado na máquina, e esconder falsearia o histórico técnico; o status
 *    da OS vai junto em cada linha para quem lê saber em que situação ocorreu.
 *    É a mesma leitura do indicador de garantias do dashboard (Módulo 5), que
 *    também não filtra por status da OS.
 *  - RN03: a garantia não é lida do banco — é derivada por `calcularGarantia`,
 *    a mesma função da tela da OS (RN05/RN06 do Módulo 3). Reaproveitar evita
 *    que as duas telas discordem sobre a mesma garantia.
 */
async function historicoDeServicos(id) {
  const equipamento = await prisma.equipamento.findUnique({
    where:   { id: Number(id) },
    include: { cliente: true },
  });
  if (!equipamento) throw Object.assign(new Error('Equipamento não encontrado.'), { status: 404 });

  const ordens = await prisma.ordemServico.findMany({
    where:   { equipamentoId: equipamento.id },
    include: { servicos: { include: { tipoServico: true } } },
    orderBy: { dataAbertura: 'desc' },
  });

  // Achata os serviços das várias OS numa lista só (RN01), carregando de qual
  // ordem cada um veio (RN02).
  const servicos = ordens
    .flatMap((ordem) =>
      ordem.servicos.map((s) => ({
        ...s,
        garantia: calcularGarantia(s),
        ordem: { id: ordem.id, numero: ordem.numero, status: ordem.status },
      }))
    )
    .sort((a, b) => new Date(b.executadoEm) - new Date(a.executadoEm));

  return {
    equipamento,
    ordens,
    servicos,
    resumo: {
      totalOrdens:       ordens.length,
      totalServicos:     servicos.length,
      emGarantia:        servicos.filter((s) => s.garantia.situacao === 'EM_GARANTIA').length,
      ultimoAtendimento: servicos.length ? servicos[0].executadoEm : null,
    },
  };
}

module.exports = {
  TIPOS_EQUIPAMENTO,
  TIPO_PADRAO,
  validarTipo, listarEquipamentos, buscarEquipamentoPorId, buscarPorCliente, criarEquipamento, atualizarEquipamento,
  historicoDeServicos };