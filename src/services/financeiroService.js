const prisma           = require('../config/database');
const itemOrdemService = require('./itemOrdemService');

/**
 * Módulo 4 (parte 2) — Controle Financeiro (RF020 / RF021)
 *
 * Duas contas com o mesmo ciclo de vida: ABERTA → PAGA ou ABERTA → CANCELADA.
 * O tipo ('PAGAR' | 'RECEBER') escolhe a tabela; as regras são as mesmas.
 *
 * Regras de negócio:
 *  - Só uma conta ABERTA pode ser quitada ou cancelada. Uma vez quitada, a
 *    conta não volta atrás (rastreabilidade — mesma lógica dos serviços do M3).
 *  - Contas não são excluídas, são canceladas.
 *  - Ao FINALIZAR uma OS, o sistema gera automaticamente a conta a receber
 *    correspondente (ver `gerarContaDaOrdem`). Uma OS gera no máximo uma conta
 *    (`ordemId` é @unique no schema).
 *  - Uma conta vencida é a que está ABERTA e com vencimento anterior a hoje —
 *    isso é derivado na leitura, não é uma quarta situação persistida.
 */

const TIPO_PAGAR   = 'PAGAR';
const TIPO_RECEBER = 'RECEBER';
const TIPOS = [TIPO_PAGAR, TIPO_RECEBER];

const ABERTA    = 'ABERTA';
const PAGA      = 'PAGA';
const CANCELADA = 'CANCELADA';
const SITUACOES = [ABERTA, PAGA, CANCELADA];

const MAX_VALOR = 9999999.99;

function erro(mensagem, status = 400) {
  return Object.assign(new Error(mensagem), { status });
}

/** Delegate do Prisma correspondente ao tipo. */
function tabela(tipo) {
  if (tipo === TIPO_PAGAR)   return prisma.contaPagar;
  if (tipo === TIPO_RECEBER) return prisma.contaReceber;
  throw erro(`Tipo de conta inválido. Use ${TIPOS.join(' ou ')}.`);
}

function rotulo(tipo) {
  return tipo === TIPO_PAGAR ? 'conta a pagar' : 'conta a receber';
}

/**
 * Converte "AAAA-MM-DD" em Date no fuso local.
 * Mesma correção do defeito D01 do Módulo 3: `new Date('2026-08-20')` seria
 * lido como meia-noite UTC e, no Brasil, exibido como 19/08. A função é
 * repetida aqui de propósito — importar de ordemServicoService criaria
 * dependência circular, porque aquele service já depende deste.
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
  return new Date(Number(ano), Number(mes) - 1, Number(dia));
}

function validarValor(bruto) {
  if (bruto === undefined || bruto === null || String(bruto).trim() === '') {
    throw erro('Informe o valor da conta.');
  }

  const valor = Number(String(bruto).replace(',', '.'));

  if (!Number.isFinite(valor)) throw erro('O valor da conta deve ser um número.');
  if (valor <= 0)              throw erro('O valor da conta deve ser maior que zero.');
  if (valor > MAX_VALOR)       throw erro('O valor da conta excede o limite permitido.');

  return valor.toFixed(2);
}

function validarDados(dados) {
  const descricao = String(dados.descricao || '').trim();
  if (descricao.length < 3)   throw erro('A descrição da conta deve ter pelo menos 3 caracteres.');
  if (descricao.length > 200) throw erro('A descrição não pode passar de 200 caracteres.');

  if (!dados.vencimento || String(dados.vencimento).trim() === '') {
    throw erro('Informe a data de vencimento.');
  }

  return {
    descricao,
    valor:       validarValor(dados.valor),
    vencimento:  parseDataLocal(dados.vencimento),
    observacoes: String(dados.observacoes || '').trim() || null,
  };
}

/** Situação derivada para exibição: ABERTA + vencida = "VENCIDA". */
function situacaoExibicao(conta) {
  if (conta.situacao !== ABERTA) return conta.situacao;

  const vencimento = new Date(conta.vencimento);
  vencimento.setHours(23, 59, 59, 999);

  return vencimento.getTime() < Date.now() ? 'VENCIDA' : ABERTA;
}

function enriquecer(contas = []) {
  return contas.map((c) => ({ ...c, situacaoExibicao: situacaoExibicao(c) }));
}

async function listarContas(tipo, filtros = {}) {
  const where = {};
  if (filtros.situacao && SITUACOES.includes(filtros.situacao)) {
    where.situacao = filtros.situacao;
  }

  const quitadaPor = { quitadaPor: { select: { id: true, nome: true } } };
  const include = tipo === TIPO_RECEBER
    ? {
        cliente: { select: { id: true, nome: true } },
        ordem:   { select: { id: true, numero: true } },
        ...quitadaPor,
      }
    : quitadaPor;

  const contas = await tabela(tipo).findMany({
    where,
    include,
    orderBy: { vencimento: 'asc' },
  });

  return enriquecer(contas);
}

async function buscarConta(tipo, id) {
  const idNum = Number(id);
  if (!idNum) throw erro('ID de conta inválido.');

  const conta = await tabela(tipo).findUnique({ where: { id: idNum } });
  if (!conta) throw erro(`${rotulo(tipo)[0].toUpperCase()}${rotulo(tipo).slice(1)} não encontrada.`, 404);
  return conta;
}

async function criarConta(tipo, dados) {
  const base = validarDados(dados);
  const extra = {};

  if (tipo === TIPO_PAGAR) {
    extra.fornecedor = String(dados.fornecedor || '').trim() || null;
  } else if (dados.clienteId && String(dados.clienteId).trim() !== '') {
    extra.clienteId = Number(dados.clienteId);
  }

  return tabela(tipo).create({ data: { ...base, ...extra } });
}

/**
 * Altera uma conta que ainda está ABERTA.
 * Conta paga ou cancelada não é editada — o histórico financeiro precisa
 * refletir o que aconteceu, não o que se gostaria que tivesse acontecido.
 */
async function editarConta(tipo, id, dados) {
  const conta = await buscarConta(tipo, id);

  if (conta.situacao !== ABERTA) {
    throw erro(
      `Só é possível editar uma conta ABERTA. Situação atual: ${conta.situacao}. ` +
      'Cancele a conta e registre uma nova, para o histórico ficar coerente.'
    );
  }

  const data = validarDados(dados);

  if (tipo === TIPO_PAGAR) {
    data.fornecedor = String(dados.fornecedor || '').trim() || null;
  } else {
    data.clienteId = dados.clienteId && String(dados.clienteId).trim() !== ''
      ? Number(dados.clienteId)
      : null;
  }

  return tabela(tipo).update({ where: { id: conta.id }, data });
}

async function quitarConta(tipo, id, usuarioId = null) {
  const conta = await buscarConta(tipo, id);

  if (conta.situacao !== ABERTA) {
    throw erro(
      `Só é possível quitar uma conta ABERTA. Situação atual: ${conta.situacao}.`
    );
  }

  return tabela(tipo).update({
    where: { id: conta.id },
    data:  {
      situacao:     PAGA,
      quitadaEm:    new Date(),
      quitadaPorId: usuarioId ? Number(usuarioId) : null,
    },
  });
}

async function cancelarConta(tipo, id) {
  const conta = await buscarConta(tipo, id);

  if (conta.situacao !== ABERTA) {
    throw erro(
      `Só é possível cancelar uma conta ABERTA. Situação atual: ${conta.situacao}.`
    );
  }

  return tabela(tipo).update({
    where: { id: conta.id },
    data:  { situacao: CANCELADA },
  });
}

/**
 * Valor a cobrar pelo encerramento de uma OS.
 *
 * O orçamento aprovado é o valor combinado com o cliente e, na prática da
 * assistência, já inclui as peças — por isso ele prevalece. A soma dos itens
 * só é usada quando a OS foi encerrada sem orçamento registrado. Os dois
 * números vão para as observações, para o Financeiro conferir e ajustar.
 */
function calcularValorDaOrdem(ordem) {
  const orcamento = Number(ordem.valorOrcamento || 0);
  const pecas     = itemOrdemService.calcularTotalItens(ordem.itens || []);
  const valor     = orcamento > 0 ? orcamento : pecas;

  return { valor: Number(valor.toFixed(2)), orcamento, pecas };
}

/**
 * Gera a conta a receber do encerramento da OS.
 * Recebe o `tx` da transação que está mudando o status, para conta e status
 * serem gravados juntos. Devolve null quando não há o que cobrar ou quando a
 * OS já tem conta gerada.
 */
async function gerarContaDaOrdem(tx, ordem) {
  const jaExiste = await tx.contaReceber.findUnique({ where: { ordemId: ordem.id } });
  if (jaExiste) return null;

  const { valor, orcamento, pecas } = calcularValorDaOrdem(ordem);
  if (valor <= 0) return null;

  const cliente = ordem.equipamento && ordem.equipamento.cliente;

  return tx.contaReceber.create({
    data: {
      descricao:   `OS ${ordem.numero}${cliente ? ` — ${cliente.nome}` : ''}`,
      valor:       valor.toFixed(2),
      vencimento:  new Date(),   // à vista, na retirada do equipamento
      observacoes:
        `Gerada automaticamente no encerramento da OS. ` +
        `Orçamento aprovado: R$ ${orcamento.toFixed(2)} | ` +
        `Peças lançadas: R$ ${pecas.toFixed(2)}.`,
      ordemId:   ordem.id,
      clienteId: cliente ? cliente.id : null,
    },
  });
}

/** Totais para os cards da tela do financeiro. */
async function resumo() {
  const [pagar, receber] = await Promise.all([
    prisma.contaPagar.findMany({ where: { situacao: ABERTA } }),
    prisma.contaReceber.findMany({ where: { situacao: ABERTA } }),
  ]);

  const somar = (contas) =>
    Number(contas.reduce((s, c) => s + Number(c.valor), 0).toFixed(2));

  const vencidas = (contas) => contas.filter((c) => situacaoExibicao(c) === 'VENCIDA');

  return {
    aPagar:           somar(pagar),
    aReceber:         somar(receber),
    saldo:            Number((somar(receber) - somar(pagar)).toFixed(2)),
    vencidasPagar:    vencidas(pagar).length,
    vencidasReceber:  vencidas(receber).length,
  };
}

module.exports = {
  TIPO_PAGAR,
  TIPO_RECEBER,
  TIPOS,
  ABERTA,
  PAGA,
  CANCELADA,
  SITUACOES,
  parseDataLocal,
  validarValor,
  validarDados,
  situacaoExibicao,
  enriquecer,
  listarContas,
  buscarConta,
  criarConta,
  editarConta,
  quitarConta,
  cancelarConta,
  calcularValorDaOrdem,
  gerarContaDaOrdem,
  resumo,
};
