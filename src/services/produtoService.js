const prisma = require('../config/database');

/**
 * Require tardio, de propósito: financeiroService -> itemOrdemService ->
 * produtoService. Importar no topo fecharia um ciclo e um dos módulos veria
 * o outro pela metade. Resolvendo na hora da chamada, os dois já carregaram.
 */
const financeiro = () => require('./financeiroService');

/**
 * Módulo 4 (parte 1) — Produtos e Estoque (RF014 / RF015)
 *
 * Regras de negócio:
 *  - `Produto.estoque` é o SALDO; `MovimentoEstoque` é o razão (histórico).
 *    Os dois só podem ser escritos juntos, dentro de uma transação — nunca
 *    se atualiza `estoque` por fora de `movimentarEstoque`.
 *  - Por isso `atualizarProduto` ignora o campo `estoque` vindo do formulário.
 *  - Saída maior que o saldo é PERMITIDA, mas devolve um aviso e deixa o
 *    estoque negativo (decisão do projeto: o cadastro de estoque costuma
 *    estar atrasado em relação ao balcão; travar a saída pararia o atendimento).
 *  - Exclusão é lógica (`ativo = false`), como em clientes, para preservar o
 *    histórico de itens de OS já lançados.
 */

const TIPO_ENTRADA = 'ENTRADA';
const TIPO_SAIDA   = 'SAIDA';
const TIPOS_MOVIMENTO = [TIPO_ENTRADA, TIPO_SAIDA];

const MAX_PRECO      = 9999999.99;
const MAX_QUANTIDADE = 999999;

function erro(mensagem, status = 400) {
  return Object.assign(new Error(mensagem), { status });
}

/** Valida o preço: obrigatório, numérico, maior que zero. Aceita vírgula. */
function validarPreco(bruto) {
  if (bruto === undefined || bruto === null || String(bruto).trim() === '') {
    throw erro('Informe o preço do produto.');
  }

  const valor = Number(String(bruto).replace(',', '.'));

  if (!Number.isFinite(valor)) throw erro('O preço deve ser um número.');
  if (valor <= 0)              throw erro('O preço deve ser maior que zero.');
  if (valor > MAX_PRECO)       throw erro('O preço excede o limite permitido.');

  return valor.toFixed(2);
}

/** Valida a quantidade de uma movimentação: inteiro maior que zero. */
function validarQuantidade(bruto, rotulo = 'A quantidade') {
  if (bruto === undefined || bruto === null || String(bruto).trim() === '') {
    throw erro(`${rotulo} é obrigatória.`);
  }

  const quantidade = Number(bruto);

  if (!Number.isInteger(quantidade))   throw erro(`${rotulo} deve ser um número inteiro.`);
  if (quantidade <= 0)                 throw erro(`${rotulo} deve ser maior que zero.`);
  if (quantidade > MAX_QUANTIDADE)     throw erro(`${rotulo} excede o limite de ${MAX_QUANTIDADE}.`);

  return quantidade;
}

function validarTipo(bruto) {
  const tipo = String(bruto || '').trim().toUpperCase();
  if (!TIPOS_MOVIMENTO.includes(tipo)) {
    throw erro(`Tipo de movimentação inválido. Use ${TIPO_ENTRADA} ou ${TIPO_SAIDA}.`);
  }
  return tipo;
}

function validarDados(dados) {
  const nome = String(dados.nome || '').trim();
  if (nome.length < 2)   throw erro('O nome do produto deve ter pelo menos 2 caracteres.');
  if (nome.length > 150) throw erro('O nome do produto não pode passar de 150 caracteres.');

  const descricao = String(dados.descricao || '').trim() || null;

  return { nome, descricao, preco: validarPreco(dados.preco) };
}

async function listarProdutos(filtros = {}) {
  const where = {};
  if (!filtros.incluirInativos) where.ativo = true;
  if (filtros.busca) where.nome = { contains: String(filtros.busca).trim() };

  return prisma.produto.findMany({ where, orderBy: { nome: 'asc' } });
}

/** Produtos que podem ser lançados numa OS: ativos, na ordem alfabética. */
async function listarDisponiveis() {
  return prisma.produto.findMany({ where: { ativo: true }, orderBy: { nome: 'asc' } });
}

async function buscarProdutoPorId(id) {
  const idNum = Number(id);
  if (!idNum) throw erro('ID de produto inválido.');

  const produto = await prisma.produto.findUnique({ where: { id: idNum } });
  if (!produto) throw erro('Produto não encontrado.', 404);
  return produto;
}

async function listarMovimentos(produtoId) {
  return prisma.movimentoEstoque.findMany({
    where:   { produtoId: Number(produtoId) },
    include: { usuario: { select: { id: true, nome: true } } },
    orderBy: { criadoEm: 'desc' },
  });
}

/**
 * Cria o produto. O estoque inicial, quando informado, entra como um
 * movimento de ENTRADA — assim o saldo nasce com histórico, e não do nada.
 */
async function criarProduto(dados) {
  const { nome, descricao, preco } = validarDados(dados);

  const existente = await prisma.produto.findFirst({ where: { nome } });
  if (existente) throw erro('Já existe um produto cadastrado com este nome.', 422);

  let estoqueInicial = 0;
  if (dados.estoque !== undefined && String(dados.estoque).trim() !== '') {
    const valor = Number(dados.estoque);
    if (!Number.isInteger(valor) || valor < 0) {
      throw erro('O estoque inicial deve ser um número inteiro igual ou maior que zero.');
    }
    estoqueInicial = valor;
  }

  return prisma.$transaction(async (tx) => {
    const produto = await tx.produto.create({
      data: { nome, descricao, preco, estoque: estoqueInicial },
    });

    if (estoqueInicial > 0) {
      await tx.movimentoEstoque.create({
        data: {
          tipo:       TIPO_ENTRADA,
          quantidade: estoqueInicial,
          descricao:  'Estoque inicial do cadastro',
          produtoId:  produto.id,
        },
      });
    }

    return produto;
  });
}

/** Atualiza os dados cadastrais. O estoque NÃO é alterado aqui (ver RN do topo). */
async function atualizarProduto(id, dados) {
  const produto = await buscarProdutoPorId(id);
  const { nome, descricao, preco } = validarDados(dados);

  const outro = await prisma.produto.findFirst({ where: { nome } });
  if (outro && outro.id !== produto.id) {
    throw erro('Já existe outro produto cadastrado com este nome.', 422);
  }

  return prisma.produto.update({
    where: { id: produto.id },
    data:  { nome, descricao, preco },
  });
}

async function excluirProduto(id) {
  const produto = await buscarProdutoPorId(id);
  return prisma.produto.update({ where: { id: produto.id }, data: { ativo: false } });
}

async function reativarProduto(id) {
  const produto = await buscarProdutoPorId(id);
  return prisma.produto.update({ where: { id: produto.id }, data: { ativo: true } });
}

/**
 * Aplica um movimento dentro de uma transação já aberta.
 * Compartilhado com o lançamento de itens na OS (itemOrdemService), que precisa
 * dar baixa no estoque na mesma transação em que grava o item.
 *
 * Devolve { movimento, produto, aviso } — `aviso` só vem preenchido quando a
 * saída deixou o saldo negativo.
 */
async function aplicarMovimento(tx, produto, { tipo, quantidade, descricao, usuarioId }) {
  const movimento = await tx.movimentoEstoque.create({
    data: {
      tipo,
      quantidade,
      descricao: descricao ? String(descricao).trim().slice(0, 200) : null,
      produtoId: produto.id,
      usuarioId: usuarioId ? Number(usuarioId) : null,
    },
  });

  // O saldo é ajustado com increment/decrement, e não com um valor calculado
  // a partir do `produto` lido antes da transação. Se duas saídas do mesmo
  // produto acontecerem ao mesmo tempo, as duas leram o mesmo saldo antigo e
  // a segunda escrita apagaria a primeira (lost update). Deixando o banco
  // fazer a aritmética, as duas baixas se somam.
  const atualizado = await tx.produto.update({
    where: { id: produto.id },
    data:  tipo === TIPO_ENTRADA
      ? { estoque: { increment: quantidade } }
      : { estoque: { decrement: quantidade } },
  });

  // O saldo verdadeiro é o que voltou do banco, não o que estava em memória.
  const saldo = atualizado.estoque;

  const aviso = saldo < 0
    ? `Atenção: o estoque de "${produto.nome}" ficou negativo (${saldo}). ` +
      'Registre a entrada das peças que já estão na bancada.'
    : null;

  return { movimento, produto: atualizado, aviso };
}

/**
 * Movimentação manual, feita pela tela de estoque (setor de Compras).
 *
 * Numa ENTRADA o usuário pode pedir para já lançar a conta a pagar da compra
 * (P03): a nota chega junto com a peça, e digitar de novo no financeiro era
 * retrabalho garantido. A conta entra na mesma transação da movimentação.
 */
async function movimentarEstoque(produtoId, dados, usuarioId = null) {
  const tipo       = validarTipo(dados.tipo);
  const quantidade = validarQuantidade(dados.quantidade);
  const produto    = await buscarProdutoPorId(produtoId);

  if (!produto.ativo) {
    throw erro('Não é possível movimentar o estoque de um produto inativo.');
  }

  const gerarConta = tipo === TIPO_ENTRADA && !!dados.gerarContaPagar;

  // Validado fora da transação: melhor recusar antes de escrever qualquer coisa.
  const dadosConta = gerarConta
    ? financeiro().validarDados({
        descricao:   `Compra de ${quantidade}x ${produto.nome}`.slice(0, 200),
        valor:       dados.valorCompra,
        vencimento:  dados.vencimentoCompra,
        observacoes: dados.descricao || null,
      })
    : null;

  return prisma.$transaction(async (tx) => {
    const resultado = await aplicarMovimento(tx, produto, {
      tipo, quantidade, descricao: dados.descricao, usuarioId,
    });

    if (dadosConta) {
      resultado.conta = await tx.contaPagar.create({
        data: {
          ...dadosConta,
          fornecedor: String(dados.fornecedorCompra || '').trim() || null,
        },
      });
    }

    return resultado;
  });
}

module.exports = {
  TIPO_ENTRADA,
  TIPO_SAIDA,
  TIPOS_MOVIMENTO,
  validarPreco,
  validarQuantidade,
  validarTipo,
  validarDados,
  listarProdutos,
  listarDisponiveis,
  buscarProdutoPorId,
  listarMovimentos,
  criarProduto,
  atualizarProduto,
  excluirProduto,
  reativarProduto,
  aplicarMovimento,
  movimentarEstoque,
};
