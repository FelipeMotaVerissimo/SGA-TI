const prisma         = require('../config/database');
const produtoService = require('./produtoService');

/**
 * Módulo 4 (parte 1) — Produtos lançados na Ordem de Serviço.
 *
 * Fecha o ciclo do estoque: até aqui só existia entrada. Lançar uma peça numa
 * OS gera a SAÍDA correspondente; remover a peça estorna com uma ENTRADA.
 *
 * Regras de negócio:
 *  - Só é possível lançar produto em OS AUTORIZADO ou EM_ANDAMENTO — a mesma
 *    janela em que o técnico registra serviços (Módulo 3).
 *  - O item e o movimento de estoque são gravados na mesma transação.
 *  - O valor unitário nasce do preço do produto, mas pode ser editado no
 *    lançamento (o vendedor negocia desconto); precisa ser maior que zero.
 *  - Itens não podem ser removidos de OS FINALIZADO ou CANCELADO
 *    (rastreabilidade, igual aos serviços executados).
 *  - Produto inativo não pode ser lançado.
 */

const STATUS_PERMITE_LANCAMENTO = ['AUTORIZADO', 'EM_ANDAMENTO'];
const STATUS_BLOQUEIA_REMOCAO   = ['FINALIZADO', 'CANCELADO'];

/**
 * Alçada de desconto (entrevista, item 8: "Gerência e ADM: liberação de
 * desconto"). O vendedor negocia até este percentual sozinho; abaixo disso o
 * preço só passa com perfil ADMINISTRADOR.
 */
const DESCONTO_LIVRE_PERCENTUAL = 10;
const PERFIL_LIBERA_DESCONTO    = 'ADMINISTRADOR';

function erro(mensagem, status = 400) {
  return Object.assign(new Error(mensagem), { status });
}

function podeLancarItem(status) {
  return STATUS_PERMITE_LANCAMENTO.includes(status);
}

function podeRemoverItem(status) {
  return !STATUS_BLOQUEIA_REMOCAO.includes(status);
}

/**
 * Percentual de desconto de um preço negociado em relação ao preço de tabela.
 * Zero quando o valor é igual ou maior que o de tabela.
 */
function calcularDesconto(precoTabela, valorNegociado) {
  const tabela = Number(precoTabela);
  const valor  = Number(valorNegociado);

  if (!Number.isFinite(tabela) || tabela <= 0) return 0;
  if (valor >= tabela) return 0;

  return ((tabela - valor) / tabela) * 100;
}

/**
 * Aplica a alçada: desconto acima do limite exige perfil de liberação.
 * `perfil` vem da sessão (web) ou do token (API); sem perfil, só passa o que
 * estiver dentro do limite.
 */
function validarAlcadaDesconto(produto, valorUnit, perfil) {
  const desconto = calcularDesconto(produto.preco, valorUnit);

  if (desconto <= DESCONTO_LIVRE_PERCENTUAL) return desconto;
  if (perfil === PERFIL_LIBERA_DESCONTO)     return desconto;

  throw erro(
    `Desconto de ${desconto.toFixed(1)}% em "${produto.nome}" precisa de liberação. ` +
    `Sem perfil ${PERFIL_LIBERA_DESCONTO}, o limite é ${DESCONTO_LIVRE_PERCENTUAL}% ` +
    `(valor mínimo R$ ${(Number(produto.preco) * (1 - DESCONTO_LIVRE_PERCENTUAL / 100)).toFixed(2)}).`
  );
}

/** Soma dos itens da OS — usada no rodapé da tabela e no financeiro. */
function calcularTotalItens(itens = []) {
  const total = itens.reduce(
    (soma, i) => soma + Number(i.valorUnit) * Number(i.quantidade),
    0
  );
  return Number(total.toFixed(2));
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
  return prisma.itemOrdem.findMany({
    where:   { ordemId: Number(ordemId) },
    include: { produto: true },
    orderBy: { id: 'asc' },
  });
}

/**
 * Lança um produto na OS e dá baixa no estoque.
 * Devolve { item, aviso } — `aviso` avisa sobre saldo negativo.
 */
async function lancarItem(ordemId, dados, usuario = {}) {
  const { id: usuarioId = null, perfil = null } = usuario;

  const ordem = await buscarOrdem(ordemId);

  if (!podeLancarItem(ordem.status)) {
    throw erro(
      `Não é possível lançar produtos numa OS com status ${ordem.status.replace('_', ' ')}. ` +
      'O status deve ser AUTORIZADO ou EM ANDAMENTO.'
    );
  }

  const produto    = await produtoService.buscarProdutoPorId(dados.produtoId);
  const quantidade = produtoService.validarQuantidade(dados.quantidade);

  if (!produto.ativo) {
    throw erro(`O produto "${produto.nome}" está inativo e não pode ser lançado.`);
  }

  // Sem valor informado, vale o preço de tabela do produto.
  const informou  = dados.valorUnit !== undefined && String(dados.valorUnit).trim() !== '';
  const valorUnit = produtoService.validarPreco(informou ? dados.valorUnit : produto.preco);

  // Preço abaixo da tabela é desconto e passa pela alçada (entrevista, item 8).
  if (informou) validarAlcadaDesconto(produto, valorUnit, perfil);

  return prisma.$transaction(async (tx) => {
    const item = await tx.itemOrdem.create({
      data: { ordemId: ordem.id, produtoId: produto.id, quantidade, valorUnit },
    });

    const { aviso } = await produtoService.aplicarMovimento(tx, produto, {
      tipo:       produtoService.TIPO_SAIDA,
      quantidade,
      descricao:  `Saída para a OS ${ordem.numero}`,
      usuarioId,
    });

    return { item, aviso };
  });
}

/**
 * Remove um item da OS e devolve a quantidade ao estoque.
 * Valida que o item pertence à OS informada (evita remoção cruzada via URL).
 */
async function removerItem(ordemId, itemId, usuario = {}) {
  const { id: usuarioId = null } = usuario;

  const item = await prisma.itemOrdem.findUnique({
    where:   { id: Number(itemId) },
    include: {
      ordem:   { select: { id: true, numero: true, status: true } },
      produto: true,
    },
  });

  if (!item) throw erro('Item não encontrado.', 404);

  if (item.ordemId !== Number(ordemId)) {
    throw erro('Este item não pertence à ordem de serviço informada.', 403);
  }

  if (!podeRemoverItem(item.ordem.status)) {
    throw erro(
      `Não é possível remover produtos de uma OS ${item.ordem.status.replace('_', ' ')}.`
    );
  }

  return prisma.$transaction(async (tx) => {
    await tx.itemOrdem.delete({ where: { id: item.id } });

    await produtoService.aplicarMovimento(tx, item.produto, {
      tipo:       produtoService.TIPO_ENTRADA,
      quantidade: item.quantidade,
      descricao:  `Estorno de item removido da OS ${item.ordem.numero}`,
      usuarioId,
    });

    return item;
  });
}

module.exports = {
  STATUS_PERMITE_LANCAMENTO,
  STATUS_BLOQUEIA_REMOCAO,
  DESCONTO_LIVRE_PERCENTUAL,
  PERFIL_LIBERA_DESCONTO,
  podeLancarItem,
  podeRemoverItem,
  calcularDesconto,
  validarAlcadaDesconto,
  calcularTotalItens,
  listarPorOrdem,
  lancarItem,
  removerItem,
};
