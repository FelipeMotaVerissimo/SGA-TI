const prisma = require('../config/database');

/**
 * Módulo 5 — Catálogo de tipos de serviço.
 *
 * Existe por causa do RF017 ("serviços mais executados por período"). A
 * descrição que o técnico escreve é livre e nunca se repete igual — "Troca de
 * tela", "troca da tela" e "Substituição da tela" seriam três serviços
 * diferentes num agrupamento por texto. O tipo é a granularidade estável:
 * o técnico escolhe da lista e continua detalhando no texto livre.
 */

const MIN_NOME = 3;
const MAX_NOME = 120;

function erro(mensagem, status = 400) {
  return Object.assign(new Error(mensagem), { status });
}

function validarNome(bruto) {
  const nome = String(bruto || '').trim();

  if (nome.length < MIN_NOME) {
    throw erro(`O nome do tipo de serviço deve ter pelo menos ${MIN_NOME} caracteres.`);
  }
  if (nome.length > MAX_NOME) {
    throw erro(`O nome do tipo de serviço não pode passar de ${MAX_NOME} caracteres.`);
  }
  return nome;
}

async function listar(filtros = {}) {
  const where = {};
  if (!filtros.incluirInativos) where.ativo = true;

  return prisma.tipoServico.findMany({ where, orderBy: { nome: 'asc' } });
}

/** Tipos que podem ser escolhidos ao registrar um serviço. */
async function listarDisponiveis() {
  return prisma.tipoServico.findMany({ where: { ativo: true }, orderBy: { nome: 'asc' } });
}

async function buscarPorId(id) {
  const idNum = Number(id);
  if (!idNum) throw erro('ID de tipo de serviço inválido.');

  const tipo = await prisma.tipoServico.findUnique({ where: { id: idNum } });
  if (!tipo) throw erro('Tipo de serviço não encontrado.', 404);
  return tipo;
}

async function criar(dados) {
  const nome = validarNome(dados.nome);

  const existente = await prisma.tipoServico.findFirst({ where: { nome } });
  if (existente) throw erro('Já existe um tipo de serviço com este nome.', 422);

  return prisma.tipoServico.create({ data: { nome } });
}

async function atualizar(id, dados) {
  const tipo = await buscarPorId(id);
  const nome = validarNome(dados.nome);

  const outro = await prisma.tipoServico.findFirst({ where: { nome } });
  if (outro && outro.id !== tipo.id) {
    throw erro('Já existe outro tipo de serviço com este nome.', 422);
  }

  return prisma.tipoServico.update({ where: { id: tipo.id }, data: { nome } });
}

/**
 * Desativação é lógica: os serviços já registrados continuam apontando para o
 * tipo, e o histórico do relatório não muda. O tipo só some da lista de escolha.
 */
async function desativar(id) {
  const tipo = await buscarPorId(id);
  return prisma.tipoServico.update({ where: { id: tipo.id }, data: { ativo: false } });
}

async function reativar(id) {
  const tipo = await buscarPorId(id);
  return prisma.tipoServico.update({ where: { id: tipo.id }, data: { ativo: true } });
}

/** Quantos serviços já foram registrados com cada tipo — usado na listagem. */
async function contarUsos() {
  const grupos = await prisma.servicoExecutado.groupBy({
    by:     ['tipoServicoId'],
    _count: { _all: true },
    where:  { tipoServicoId: { not: null } },
  });

  return grupos.reduce((mapa, g) => {
    mapa[g.tipoServicoId] = g._count._all;
    return mapa;
  }, {});
}

module.exports = {
  MIN_NOME,
  MAX_NOME,
  validarNome,
  listar,
  listarDisponiveis,
  buscarPorId,
  criar,
  atualizar,
  desativar,
  reativar,
  contarUsos,
};
