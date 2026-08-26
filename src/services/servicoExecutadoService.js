const prisma = require('../config/database');

/**
 * Módulo 3 (parte 2) — Serviços Executados e Garantia
 *
 * Regras de negócio:
 *  - Serviços só podem ser registrados em OS com status AUTORIZADO ou EM_ANDAMENTO.
 *  - Ao registrar um serviço numa OS AUTORIZADO, a OS passa para EM_ANDAMENTO.
 *  - A garantia NÃO é persistida como data: é derivada de (executadoEm + garantiaDias).
 *  - Serviços não podem ser excluídos de OS FINALIZADO ou CANCELADO (rastreabilidade).
 */

const STATUS_PERMITE_REGISTRO  = ['AUTORIZADO', 'EM_ANDAMENTO'];
const STATUS_BLOQUEIA_EXCLUSAO = ['FINALIZADO', 'CANCELADO'];

const MAX_GARANTIA_DIAS = 3650; // 10 anos — limite de sanidade
const MS_POR_DIA = 24 * 60 * 60 * 1000;

function erro(mensagem, status = 400) {
  return Object.assign(new Error(mensagem), { status });
}

function podeRegistrarServico(status) {
  return STATUS_PERMITE_REGISTRO.includes(status);
}

/**
 * Calcula a situação da garantia de um serviço.
 * Retorna sempre o mesmo formato, mesmo quando não há garantia.
 */
function calcularGarantia(servico) {
  const dias = Number(servico.garantiaDias);

  if (!Number.isFinite(dias) || dias <= 0) {
    return {
      possuiGarantia: false,
      situacao: 'SEM_GARANTIA',
      rotulo: 'Sem garantia',
      dataFim: null,
      diasRestantes: null,
    };
  }

  // Último dia coberto = data de execução + garantiaDias.
  // A garantia vale até o FIM desse dia.
  const dataFim = new Date(servico.executadoEm);
  dataFim.setDate(dataFim.getDate() + dias);
  dataFim.setHours(23, 59, 59, 999);

  // Contagem em dias de calendário: compara meia-noite com meia-noite,
  // evitando resultado com off-by-one por causa da hora do dia.
  const fimZerado = new Date(dataFim);
  fimZerado.setHours(0, 0, 0, 0);

  const hojeZerado = new Date();
  hojeZerado.setHours(0, 0, 0, 0);

  const diasRestantes = Math.round((fimZerado.getTime() - hojeZerado.getTime()) / MS_POR_DIA);
  const vigente = diasRestantes >= 0; // 0 = último dia de garantia, ainda vigente

  let rotulo;
  if (!vigente)               rotulo = 'Garantia vencida';
  else if (diasRestantes === 0) rotulo = 'Último dia de garantia';
  else                        rotulo = `Em garantia — ${diasRestantes} dia(s) restante(s)`;

  return {
    possuiGarantia: true,
    situacao: vigente ? 'EM_GARANTIA' : 'VENCIDA',
    rotulo,
    dataFim,
    diasRestantes: vigente ? diasRestantes : 0,
  };
}

/**
 * Recebe a lista de serviços vinda do Prisma e devolve uma cópia
 * com o objeto `garantia` anexado a cada item (para uso nas views).
 */
function enriquecerComGarantia(servicos = []) {
  return servicos.map((s) => ({ ...s, garantia: calcularGarantia(s) }));
}

function validarDados(dados) {
  const descricao = String(dados.descricao || '').trim();
  if (descricao.length < 5) {
    throw erro('A descrição do serviço executado deve ter pelo menos 5 caracteres.');
  }

  const observacoes = String(dados.observacoes || '').trim() || null;

  let garantiaDias = null;
  const bruto = dados.garantiaDias;

  if (bruto !== undefined && bruto !== null && String(bruto).trim() !== '') {
    garantiaDias = Number(bruto);

    if (!Number.isInteger(garantiaDias) || garantiaDias < 0) {
      throw erro('A garantia deve ser um número inteiro de dias igual ou maior que zero.');
    }
    if (garantiaDias > MAX_GARANTIA_DIAS) {
      throw erro(`A garantia não pode ultrapassar ${MAX_GARANTIA_DIAS} dias.`);
    }
    if (garantiaDias === 0) garantiaDias = null; // 0 dia = sem garantia
  }

  // Módulo 5: o tipo é o que permite agrupar no RF017. Opcional — o técnico
  // pode registrar um serviço que ainda não está no catálogo.
  let tipoServicoId = null;
  if (dados.tipoServicoId !== undefined && String(dados.tipoServicoId).trim() !== '') {
    tipoServicoId = Number(dados.tipoServicoId);
    if (!Number.isInteger(tipoServicoId) || tipoServicoId <= 0) {
      throw erro('Tipo de serviço inválido.');
    }
  }

  return { descricao, observacoes, garantiaDias, tipoServicoId };
}

async function buscarOrdem(ordemId) {
  const ordem = await prisma.ordemServico.findUnique({
    where:  { id: Number(ordemId) },
    select: { id: true, numero: true, status: true },
  });
  if (!ordem) throw erro('Ordem de serviço não encontrada.', 404);
  return ordem;
}

async function listarPorOrdem(ordemId) {
  const servicos = await prisma.servicoExecutado.findMany({
    where:   { ordemId: Number(ordemId) },
    include: { tipoServico: true },
    orderBy: { executadoEm: 'desc' },
  });
  return enriquecerComGarantia(servicos);
}

/**
 * Registra um serviço executado na OS.
 * Usa transação: criar o serviço e mover a OS para EM_ANDAMENTO
 * precisam acontecer juntos ou não acontecer.
 */
async function registrarServico(ordemId, dados) {
  const ordem = await buscarOrdem(ordemId);

  if (!podeRegistrarServico(ordem.status)) {
    throw erro(
      `Não é possível registrar serviços numa OS com status ${ordem.status.replace('_', ' ')}. ` +
      'O status deve ser AUTORIZADO ou EM ANDAMENTO.'
    );
  }

  const { descricao, observacoes, garantiaDias, tipoServicoId } = validarDados(dados);

  return prisma.$transaction(async (tx) => {
    const servico = await tx.servicoExecutado.create({
      data: { descricao, observacoes, garantiaDias, tipoServicoId, ordemId: ordem.id },
    });

    if (ordem.status === 'AUTORIZADO') {
      await tx.ordemServico.update({
        where: { id: ordem.id },
        data:  { status: 'EM_ANDAMENTO' },
      });
    }

    return servico;
  });
}

/**
 * Exclui um serviço executado.
 * Valida que o serviço pertence à OS informada (evita exclusão cruzada via URL).
 */
async function excluirServico(ordemId, servicoId) {
  const servico = await prisma.servicoExecutado.findUnique({
    where:   { id: Number(servicoId) },
    include: { ordem: { select: { id: true, status: true } } },
  });

  if (!servico) throw erro('Serviço executado não encontrado.', 404);

  if (servico.ordemId !== Number(ordemId)) {
    throw erro('Este serviço não pertence à ordem de serviço informada.', 403);
  }

  if (STATUS_BLOQUEIA_EXCLUSAO.includes(servico.ordem.status)) {
    throw erro(
      `Não é possível excluir serviços de uma OS ${servico.ordem.status.replace('_', ' ')}.`
    );
  }

  return prisma.servicoExecutado.delete({ where: { id: servico.id } });
}

module.exports = {
  STATUS_PERMITE_REGISTRO,
  STATUS_BLOQUEIA_EXCLUSAO,
  podeRegistrarServico,
  calcularGarantia,
  enriquecerComGarantia,
  listarPorOrdem,
  registrarServico,
  excluirServico,
};
