const prisma = require('../config/database');

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
      usuario: { select: { id: true, nome: true } },
    },
    orderBy: { dataAbertura: 'desc' },
  });
}

async function buscarOrdemPorId(id) {
  const ordem = await prisma.ordemServico.findUnique({
    where: { id: Number(id) },
    include: {
      equipamento: { include: { cliente: true } },
      servicos: true,
      itens:    { include: { produto: true } },
      usuario:  { select: { id: true, nome: true } },
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
      observacoes:     dados.observacoes,
      equipamentoId:   Number(dados.equipamentoId),
      usuarioId:       Number(usuarioId),
    },
  });
}

async function atualizarStatus(id, status) {
  await buscarOrdemPorId(id);
  const extra = {};
  if (status === 'FINALIZADO') extra.dataFechamento = new Date();
  return prisma.ordemServico.update({
    where: { id: Number(id) },
    data:  { status, ...extra },
  });
}

async function registrarOrcamento(id, dados) {
  await buscarOrdemPorId(id);
  return prisma.ordemServico.update({
    where: { id: Number(id) },
    data: {
      valorOrcamento:  dados.valorOrcamento,
      dataAprovacao:   dados.dataAprovacao   ? new Date(dados.dataAprovacao)   : undefined,
      previsaoEntrega: dados.previsaoEntrega ? new Date(dados.previsaoEntrega) : undefined,
      status:          'ORCAMENTO',
    },
  });
}

module.exports = { listarOrdens, buscarOrdemPorId, abrirOrdem, atualizarStatus, registrarOrcamento };