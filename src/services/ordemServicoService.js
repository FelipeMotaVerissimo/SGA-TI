const prisma            = require('../config/database');
const financeiroService = require('./financeiroService'); // Módulo 4 - parte 2

// Status em que o orçamento ainda pode ser lançado/alterado.
// FINALIZADO e CANCELADO ficam de fora (rastreabilidade);
// AUTORIZADO e EM_ANDAMENTO também, para não desfazer uma aprovação já feita.
const STATUS_PERMITE_ORCAMENTO = ['INICIAL', 'ORCAMENTO'];

function erro(mensagem, status = 400) {
  return Object.assign(new Error(mensagem), { status });
}

/**
 * Converte "AAAA-MM-DD" (vindo de <input type="date">) em Date no fuso local.
 * `new Date('2026-08-20')` seria interpretado como meia-noite UTC e, no Brasil,
 * exibido como 19/08 — por isso a data é montada campo a campo.
 */
function parseDataLocal(valor) {
  if (!valor) return null;
  if (valor instanceof Date) return valor;

  const partes = String(valor).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!partes) {
    const data = new Date(valor);
    if (Number.isNaN(data.getTime())) throw erro('Data inválida.');
    return data;
  }

  const [, ano, mes, dia] = partes;
  const data = new Date(Number(ano), Number(mes) - 1, Number(dia));
  if (Number.isNaN(data.getTime())) throw erro('Data inválida.');
  return data;
}

/** Valida o valor do orçamento: obrigatório, numérico e maior que zero. */
function validarValorOrcamento(bruto) {
  if (bruto === undefined || bruto === null || String(bruto).trim() === '') {
    throw erro('Informe o valor do orçamento.');
  }

  const valor = Number(String(bruto).replace(',', '.'));

  if (!Number.isFinite(valor))  throw erro('O valor do orçamento deve ser um número.');
  if (valor <= 0)               throw erro('O valor do orçamento deve ser maior que zero.');
  if (valor > 9999999.99)       throw erro('O valor do orçamento excede o limite permitido.');

  return valor.toFixed(2);
}

function gerarNumeroOS() {
  const ano = new Date().getFullYear();
  const seq = Date.now().toString().slice(-6);
  return `OS-${ano}-${seq}`;
}

async function listarOrdens(filtros = {}) {
  const where = {};
  if (filtros.status)    where.status = filtros.status;
  if (filtros.clienteId) where.equipamento = { clienteId: Number(filtros.clienteId) };
  return prisma.ordemServico.findMany({
    where,
    include: {
      equipamento: { include: { cliente: true } },
      usuario:     { select: { id: true, nome: true } },
    },
    orderBy: { dataAbertura: 'desc' },
  });
}

async function buscarOrdemPorId(id) {
  const ordem = await prisma.ordemServico.findUnique({
    where: { id: Number(id) },
    include: {
      equipamento: { include: { cliente: true } },
      servicos:    true,
      itens:       { include: { produto: true } },
      usuario:     { select: { id: true, nome: true } },
    },
  });
  if (!ordem) throw Object.assign(new Error('Ordem de serviço não encontrada.'), { status: 404 });
  return ordem;
}

async function buscarOrdemPorNumero(numero) {
  const ordem = await prisma.ordemServico.findUnique({
    where: { numero },
    include: {
      equipamento: { include: { cliente: true } },
      servicos:    { orderBy: { executadoEm: 'desc' } },   // Módulo 3 - parte 2
    },
  });
  if (!ordem) throw Object.assign(new Error('Ordem de serviço não encontrada.'), { status: 404 });
  return ordem;
}

async function abrirOrdem(dados, usuarioId) {
  return prisma.ordemServico.create({
    data: {
      numero:          gerarNumeroOS(),
      defeitoRelatado: dados.defeitoRelatado,
      observacoes:     dados.observacoes || null,
      equipamentoId:   Number(dados.equipamentoId),
      usuarioId:       Number(usuarioId),
    },
  });
}

/**
 * Atualiza o status da OS.
 *
 * Módulo 4 (parte 2): ao FINALIZAR, o sistema também gera a conta a receber
 * do atendimento. As duas escritas vão na mesma transação — uma OS encerrada
 * sem o lançamento financeiro (ou o contrário) deixaria o caixa inconsistente.
 */
async function atualizarStatus(id, status, opcoes = {}) {
  const ordem = await buscarOrdemPorId(id);

  // Módulo 4: encerrar a OS gera a conta a receber, ou seja, é faturar. Na
  // entrevista (item 8) a liberação de faturamento é da Gerência/ADM, por isso
  // FINALIZADO só passa pela rota própria, que exige o perfil.
  if (status === 'FINALIZADO' && !opcoes.liberadoParaFaturar) {
    throw erro(
      'Encerrar a ordem de serviço gera o faturamento e depende de liberação ' +
      'da gerência. Use a ação "Faturar e encerrar".'
    );
  }

  const extra = {};
  if (status === 'FINALIZADO') extra.dataFechamento = new Date();

  return prisma.$transaction(async (tx) => {
    const atualizada = await tx.ordemServico.update({
      where: { id: ordem.id },
      data:  { status, ...extra },
    });

    if (status === 'FINALIZADO' && ordem.status !== 'FINALIZADO') {
      await financeiroService.gerarContaDaOrdem(tx, ordem);
    }

    return atualizada;
  });
}

async function registrarOrcamento(id, dados) {
  const ordem = await buscarOrdemPorId(id);

  // Sem esta trava, salvar o orçamento de novo jogava a OS de volta para
  // ORCAMENTO e apagava a data de aprovação, mesmo com serviços já registrados.
  if (!STATUS_PERMITE_ORCAMENTO.includes(ordem.status)) {
    throw erro(
      `Não é possível alterar o orçamento de uma OS com status ${ordem.status.replace('_', ' ')}. ` +
      'O orçamento só pode ser lançado enquanto a OS estiver INICIAL ou ORCAMENTO.'
    );
  }

  const data = {
    valorOrcamento:  validarValorOrcamento(dados.valorOrcamento),
    previsaoEntrega: parseDataLocal(dados.previsaoEntrega),
    status:          'ORCAMENTO',
  };

  // A data de aprovação é definida por aprovarOrcamento. Só é tocada aqui
  // se o formulário enviar o campo explicitamente.
  if (dados.dataAprovacao !== undefined) {
    data.dataAprovacao = parseDataLocal(dados.dataAprovacao);
  }

  return prisma.ordemServico.update({ where: { id: Number(id) }, data });
}

async function aprovarOrcamento(id) {
  const ordem = await buscarOrdemPorId(id);

  if (ordem.status !== 'ORCAMENTO') {
    throw erro(
      `Só é possível aprovar uma OS com status ORCAMENTO. Status atual: ${ordem.status.replace('_', ' ')}.`
    );
  }
  if (ordem.valorOrcamento === null || ordem.valorOrcamento === undefined) {
    throw erro('Registre o valor do orçamento antes de aprová-lo.');
  }

  return prisma.ordemServico.update({
    where: { id: Number(id) },
    data: {
      status:        'AUTORIZADO',
      dataAprovacao: new Date(),
    },
  });
}

async function rejeitarOrcamento(id) {
  const ordem = await buscarOrdemPorId(id);

  if (ordem.status !== 'ORCAMENTO') {
    throw erro(
      `Só é possível rejeitar uma OS com status ORCAMENTO. Status atual: ${ordem.status.replace('_', ' ')}.`
    );
  }

  return prisma.ordemServico.update({
    where: { id: Number(id) },
    data:  { status: 'CANCELADO' },
  });
}

/**
 * Encerra a OS liberando o faturamento. Só a rota protegida pelo perfil de
 * gerência chega aqui — a diferença para `atualizarStatus` é exatamente a
 * liberação.
 */
async function faturarEEncerrar(id) {
  return atualizarStatus(id, 'FINALIZADO', { liberadoParaFaturar: true });
}

module.exports = {
  STATUS_PERMITE_ORCAMENTO,
  faturarEEncerrar,
  parseDataLocal,
  validarValorOrcamento,
  listarOrdens,
  buscarOrdemPorId,
  buscarOrdemPorNumero,
  abrirOrdem,
  atualizarStatus,
  registrarOrcamento,
  aprovarOrcamento,
  rejeitarOrcamento,
};