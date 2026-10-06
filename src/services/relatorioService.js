const prisma = require('../config/database');

/**
 * Módulo 5 — Relatórios gerenciais (RF016 a RF019).
 *
 * Todos os relatórios recebem o mesmo par de datas e devolvem linhas já
 * ordenadas e prontas para a tela. A agregação é feita em JavaScript, e não
 * com `groupBy` do Prisma, por dois motivos:
 *
 *  - o que interessa somar é `quantidade * valorUnit`, e `groupBy` não soma
 *    expressão, só coluna;
 *  - agrupar por campo de relação (o cliente está a duas tabelas de distância
 *    da OS) exigiria SQL cru, que não roda igual em MySQL e SQLite.
 *
 * No volume de uma assistência técnica isso é irrelevante. Se um dia o volume
 * crescer, o caminho é uma view no banco ou `$queryRaw` por dialeto.
 */

const PERIODO_PADRAO_DIAS = 30;
const LIMITE_PADRAO       = 10;

// Uma OS cancelada é orçamento recusado — não é venda, e não entra em relatório
// de faturamento (RF016).
const STATUS_FORA_DO_FATURAMENTO = ['CANCELADO'];

// Status em que o cliente já aprovou o serviço.
const STATUS_APROVADOS = ['AUTORIZADO', 'EM_ANDAMENTO', 'FINALIZADO'];

function erro(mensagem, status = 400) {
  return Object.assign(new Error(mensagem), { status });
}

/**
 * Converte "AAAA-MM-DD" em Date no fuso local (mesma correção do defeito D01
 * do Módulo 3 — `new Date('2026-08-20')` seria meia-noite UTC e viraria 19/08).
 */
function parseDataLocal(valor, fimDoDia = false) {
  if (!valor) return null;

  const partes = String(valor).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!partes) throw erro('Data inválida. Use o formato AAAA-MM-DD.');

  const [, ano, mes, dia] = partes;
  const data = new Date(Number(ano), Number(mes) - 1, Number(dia));

  if (fimDoDia) data.setHours(23, 59, 59, 999);
  return data;
}

/**
 * Resolve o período do relatório. Sem filtro, usa os últimos 30 dias.
 * A data final vale até o FIM do dia — senão um relatório de "01/08 a 31/08"
 * perderia tudo que aconteceu no dia 31.
 */
function resolverPeriodo(filtros = {}) {
  const ate = parseDataLocal(filtros.ate, true) || (() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d;
  })();

  const de = parseDataLocal(filtros.de) || (() => {
    // "Últimos 30 dias" contando o dia de hoje: por isso -29 e não -30, senão
    // a janela cobriria 31 dias de calendário e contrariaria o próprio rótulo.
    const d = new Date(ate);
    d.setDate(d.getDate() - (PERIODO_PADRAO_DIAS - 1));
    d.setHours(0, 0, 0, 0);
    return d;
  })();

  if (de > ate) throw erro('A data inicial não pode ser maior que a data final.');

  return { de, ate };
}

/** Formata o período para o value de <input type="date">. */
function formatarDataInput(data) {
  const d = new Date(data);
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

const arredondar = (n) => Number(Number(n).toFixed(2));

/**
 * RF016 — Maiores clientes por período.
 *
 * Tabela: OrdemServico -> Equipamento -> Cliente
 * Granularidade: uma linha por cliente
 * Período: data de abertura da OS
 * Valor: soma de `valorOrcamento` (decisão do grupo: mede o que foi vendido).
 *        OS canceladas ficam de fora. A coluna "aprovado" separa o que o
 *        cliente já autorizou do que ainda é só proposta.
 */
async function maioresClientes(filtros = {}) {
  const { de, ate } = resolverPeriodo(filtros);
  const limite = Number(filtros.limite) || LIMITE_PADRAO;

  const ordens = await prisma.ordemServico.findMany({
    where: {
      dataAbertura: { gte: de, lte: ate },
      status:       { notIn: STATUS_FORA_DO_FATURAMENTO },
    },
    include: { equipamento: { include: { cliente: true } } },
  });

  const porCliente = new Map();

  for (const os of ordens) {
    const cliente = os.equipamento.cliente;
    const atual = porCliente.get(cliente.id) || {
      clienteId: cliente.id,
      cliente:   cliente.nome,
      cpfCnpj:   cliente.cpfCnpj,
      ordens:    0,
      total:     0,
      aprovado:  0,
    };

    const valor = Number(os.valorOrcamento || 0);
    atual.ordens += 1;
    atual.total  += valor;
    if (STATUS_APROVADOS.includes(os.status)) atual.aprovado += valor;

    porCliente.set(cliente.id, atual);
  }

  return [...porCliente.values()]
    .map((linha) => ({
      ...linha,
      total:       arredondar(linha.total),
      aprovado:    arredondar(linha.aprovado),
      ticketMedio: arredondar(linha.ordens ? linha.total / linha.ordens : 0),
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limite);
}

/**
 * RF018 — Produtos mais vendidos.
 *
 * Tabela: ItemOrdem -> Produto
 * Granularidade: uma linha por produto
 * Período: `ItemOrdem.criadoEm` — a data em que a peça foi lançada, não a da OS
 * Valor: soma de `quantidade * valorUnit`
 */
async function produtosMaisVendidos(filtros = {}) {
  const { de, ate } = resolverPeriodo(filtros);
  const limite = Number(filtros.limite) || LIMITE_PADRAO;

  const itens = await prisma.itemOrdem.findMany({
    where:   { criadoEm: { gte: de, lte: ate } },
    include: { produto: true },
  });

  const porProduto = new Map();

  for (const item of itens) {
    const atual = porProduto.get(item.produtoId) || {
      produtoId: item.produtoId,
      produto:   item.produto.nome,
      ativo:     item.produto.ativo,
      quantidade: 0,
      total:      0,
    };

    atual.quantidade += item.quantidade;
    atual.total      += Number(item.valorUnit) * item.quantidade;

    porProduto.set(item.produtoId, atual);
  }

  return [...porProduto.values()]
    .map((linha) => ({ ...linha, total: arredondar(linha.total) }))
    .sort((a, b) => b.quantidade - a.quantidade)
    .slice(0, limite);
}

/**
 * RF017 — Serviços mais executados por período.
 *
 * Tabela: ServicoExecutado -> TipoServico
 * Granularidade: uma linha por tipo de serviço
 * Período: `executadoEm`
 * Serviços registrados antes do catálogo existir não têm tipo e aparecem
 * agrupados como "Não classificado" — mentir sobre eles seria pior.
 */
async function servicosMaisExecutados(filtros = {}) {
  const { de, ate } = resolverPeriodo(filtros);
  const limite = Number(filtros.limite) || LIMITE_PADRAO;

  const servicos = await prisma.servicoExecutado.findMany({
    where:   { executadoEm: { gte: de, lte: ate } },
    include: { tipoServico: true },
  });

  const porTipo = new Map();

  for (const servico of servicos) {
    const chave  = servico.tipoServicoId || 'sem-tipo';
    const atual  = porTipo.get(chave) || {
      tipoServicoId: servico.tipoServicoId,
      tipo:          servico.tipoServico ? servico.tipoServico.nome : 'Não classificado',
      classificado:  Boolean(servico.tipoServicoId),
      quantidade:    0,
      comGarantia:   0,
    };

    atual.quantidade += 1;
    if (servico.garantiaDias) atual.comGarantia += 1;

    porTipo.set(chave, atual);
  }

  return [...porTipo.values()]
    .sort((a, b) => b.quantidade - a.quantidade)
    .slice(0, limite);
}

/**
 * RF019 — Serviços e produtos vendidos por tipo de equipamento.
 *
 * Tabelas: ServicoExecutado -> OrdemServico -> Equipamento
 *          ItemOrdem        -> OrdemServico -> Equipamento
 * Granularidade: uma linha por tipo de equipamento
 * Período: `executadoEm` do serviço e `criadoEm` da peça
 *
 * As duas contagens vêm de caminhos diferentes e são somadas na mesma linha:
 * é exatamente o cruzamento que o consultor pediu na entrevista.
 */
async function porTipoDeEquipamento(filtros = {}) {
  const { de, ate } = resolverPeriodo(filtros);

  const [servicos, itens] = await Promise.all([
    prisma.servicoExecutado.findMany({
      where:   { executadoEm: { gte: de, lte: ate } },
      include: { ordem: { include: { equipamento: true } } },
    }),
    prisma.itemOrdem.findMany({
      where:   { criadoEm: { gte: de, lte: ate } },
      include: { ordem: { include: { equipamento: true } } },
    }),
  ]);

  const porTipo = new Map();

  const linha = (tipo) => {
    if (!porTipo.has(tipo)) {
      porTipo.set(tipo, { tipo, servicos: 0, pecas: 0, totalPecas: 0 });
    }
    return porTipo.get(tipo);
  };

  for (const servico of servicos) {
    linha(servico.ordem.equipamento.tipo).servicos += 1;
  }

  for (const item of itens) {
    const l = linha(item.ordem.equipamento.tipo);
    l.pecas      += item.quantidade;
    l.totalPecas += Number(item.valorUnit) * item.quantidade;
  }

  return [...porTipo.values()]
    .map((l) => ({ ...l, totalPecas: arredondar(l.totalPecas) }))
    .sort((a, b) => (b.servicos + b.pecas) - (a.servicos + a.pecas));
}

/**
 * Indicadores de estoque para o dashboard.
 *
 * O saldo negativo é o número que mais importa aqui: é a fila de regularização
 * do setor de Compras, criada pela decisão D1 do Módulo 4 (saída acima do saldo
 * é permitida, com aviso).
 */
async function indicadoresEstoque() {
  const produtos = await prisma.produto.findMany({ where: { ativo: true } });

  const negativos = produtos.filter((p) => p.estoque < 0);
  const zerados   = produtos.filter((p) => p.estoque === 0);

  const valorEmEstoque = produtos.reduce(
    (soma, p) => soma + (p.estoque > 0 ? Number(p.preco) * p.estoque : 0),
    0
  );

  return {
    ativos:         produtos.length,
    negativos:      negativos.length,
    zerados:        zerados.length,
    valorEmEstoque: arredondar(valorEmEstoque),
    // lista curta para o gestor agir, não só olhar o número
    aRegularizar:   negativos
      .sort((a, b) => a.estoque - b.estoque)
      .slice(0, 5)
      .map((p) => ({ id: p.id, nome: p.nome, estoque: p.estoque })),
  };
}

/**
 * Serviços com garantia ainda vigente. Vem do RF013 (controle de garantia) e
 * serve de alerta: é o passivo aberto da assistência.
 */
async function indicadoresGarantia() {
  const comGarantia = await prisma.servicoExecutado.findMany({
    where:   { garantiaDias: { not: null } },
    include: { ordem: { select: { id: true, numero: true } } },
  });

  const agora = Date.now();
  const vigentes = comGarantia.filter((s) => {
    const fim = new Date(s.executadoEm);
    fim.setDate(fim.getDate() + s.garantiaDias);
    fim.setHours(23, 59, 59, 999);
    return fim.getTime() >= agora;
  });

  // Vencendo nos próximos 15 dias: é o que o gestor precisa olhar hoje.
  const limite = new Date();
  limite.setDate(limite.getDate() + 15);

  const vencendo = vigentes.filter((s) => {
    const fim = new Date(s.executadoEm);
    fim.setDate(fim.getDate() + s.garantiaDias);
    return fim <= limite;
  });

  return { vigentes: vigentes.length, vencendoEm15Dias: vencendo.length };
}

module.exports = {
  PERIODO_PADRAO_DIAS,
  LIMITE_PADRAO,
  STATUS_FORA_DO_FATURAMENTO,
  STATUS_APROVADOS,
  parseDataLocal,
  resolverPeriodo,
  formatarDataInput,
  maioresClientes,
  produtosMaisVendidos,
  servicosMaisExecutados,
  porTipoDeEquipamento,
  indicadoresEstoque,
  indicadoresGarantia,
};
