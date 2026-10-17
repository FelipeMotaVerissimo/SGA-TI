const prisma         = require('../config/database');
const geocodificacao = require('./geocodificacaoService');

/**
 * Módulo 6 — saída de entrega.
 *
 * Uma saída é uma viagem do entregador levando uma ou mais OS finalizadas.
 * Este service concentra as regras RN15 a RN25 (ver docs/DER.md, seção 5).
 * RN13 (uma saída em rota) e RN14 (OS em uma só entrega pendente) são
 * garantidas pelo próprio banco, com índice único; aqui só se traduz o erro.
 */

function erro(mensagem, status = 400) {
  return Object.assign(new Error(mensagem), { status });
}

const PERFIL_ADMIN = 'ADMINISTRADOR';
const ehAdmin = (usuario) => Boolean(usuario && usuario.perfil === PERFIL_ADMIN);

/** RN16: a lista mostra só OS faturadas neste período. `[VALIDAR: 30 dias]` */
const DIAS_ELEGIVEL = 30;
/** RN21: posição mais próxima que isso da anterior é descartada. */
const INTERVALO_MINIMO_POSICAO_MS = 5000;
/** RN23 */
const MOTIVO_MINIMO = 3;
const MOTIVO_CANCELAMENTO = 'Saída cancelada';

const INCLUDE_ENTREGA = {
  ordem: { include: { equipamento: { include: { cliente: true } } } },
};

// --------------------------------------------------------------- consultas

/**
 * OS que podem sair para entrega.
 * RN15: FINALIZADO. RN16: sem entrega ENTREGUE e sem entrega PENDENTE (as
 * NAO_ENTREGUE podem sair de novo), faturadas nos últimos DIAS_ELEGIVEL dias.
 */
async function listarElegiveis(agora = new Date()) {
  const desde = new Date(agora.getTime() - DIAS_ELEGIVEL * 24 * 60 * 60 * 1000);
  return prisma.ordemServico.findMany({
    where: {
      status:         'FINALIZADO',
      dataFechamento: { gte: desde },
      entregas:       { none: { status: { in: ['ENTREGUE', 'PENDENTE'] } } },
    },
    include: { equipamento: { include: { cliente: true } } },
    orderBy: { dataFechamento: 'desc' },
  });
}

/** A saída em rota, se houver (RN13 garante que é no máximo uma). */
async function saidaAtiva() {
  return prisma.saidaEntrega.findUnique({
    where:   { emRota: true },
    include: {
      entregador: { select: { id: true, nome: true } },
      entregas:   { include: INCLUDE_ENTREGA, orderBy: { ordemParada: 'asc' } },
    },
  });
}

// -------------------------------------------------------- geocodificação

/** Buscas em andamento — os testes esperam por elas, como na auditoria. */
const geocodificacoesPendentes = new Set();

function aguardarGeocodificacoes() {
  return Promise.allSettled([...geocodificacoesPendentes]);
}

/**
 * Geocodifica os destinos da saída **depois** que ela já começou. O
 * entregador não espera a busca (até ~5 s por OS) para sair; o pino aparece
 * quando a coordenada chega. Falha deixa o destino nulo, que é o caso
 * previsto: o cliente vê só o entregador.
 */
function geocodificarDestinos(entregas) {
  for (const entrega of entregas) {
    const tarefa = (async () => {
      const coordenada = await geocodificacao.geocodificar(entrega.ordem.equipamento.cliente);
      if (!coordenada) return;
      await prisma.entregaOS.updateMany({
        where: { id: entrega.id, status: 'PENDENTE' },
        data:  { destinoLat: coordenada.lat, destinoLng: coordenada.lng },
      });
    })().catch(() => {});
    geocodificacoesPendentes.add(tarefa);
    tarefa.finally(() => geocodificacoesPendentes.delete(tarefa));
  }
}

// ------------------------------------------------------------------ saída

function normalizarIds(ordemIds) {
  const lista = [].concat(ordemIds === undefined ? [] : ordemIds);
  const ids = lista.map(Number);
  if (ids.some((n) => !Number.isInteger(n) || n <= 0)) throw erro('Ordem de serviço inválida.');
  return [...new Set(ids)];
}

/**
 * Inicia a saída com as OS escolhidas, na ordem em que vieram.
 * RN15/RN16/RN17: tudo ou nada. RN18: o entregador é o usuário logado.
 */
async function iniciarSaida(ordemIds, usuario) {
  if (!usuario || !Number.isInteger(usuario.id)) throw erro('Usuário não identificado.', 401);

  const ids = normalizarIds(ordemIds);
  if (ids.length === 0) throw erro('Escolha ao menos uma OS para sair.'); // RN17

  const ordens = await prisma.ordemServico.findMany({
    where:   { id: { in: ids } },
    include: { entregas: { select: { status: true } } },
  });
  if (ordens.length !== ids.length) throw erro('Ordem de serviço não encontrada.', 404);

  for (const os of ordens) {
    if (os.status !== 'FINALIZADO') {
      throw erro(`A OS ${os.numero} não está finalizada e não pode sair para entrega.`); // RN15
    }
    if (os.entregas.some((e) => e.status === 'ENTREGUE')) {
      throw erro(`A OS ${os.numero} já foi entregue.`); // RN16
    }
    if (os.entregas.some((e) => e.status === 'PENDENTE')) {
      throw erro(`A OS ${os.numero} já está numa entrega em andamento.`); // RN14
    }
  }

  let saida;
  try {
    saida = await prisma.$transaction(async (tx) => {
      const criada = await tx.saidaEntrega.create({ data: { entregadorId: usuario.id } });
      for (const [i, ordemId] of ids.entries()) {
        await tx.entregaOS.create({
          data: { saidaId: criada.id, ordemId, ordemParada: i + 1, ordemPendenteId: ordemId },
        });
      }
      return criada;
    });
  } catch (e) {
    // RN13/RN14 garantidas pelo banco: o índice único recusou.
    if (e && e.code === 'P2002') {
      const alvo = String((e.meta && e.meta.target) || '');
      if (alvo.includes('emRota')) throw erro('Já existe uma saída em rota. Encerre-a antes de iniciar outra.', 409);
      throw erro('Uma das OS já está numa entrega em andamento.', 409);
    }
    throw e;
  }

  const completa = await prisma.saidaEntrega.findUnique({
    where:   { id: saida.id },
    include: { entregas: { include: INCLUDE_ENTREGA, orderBy: { ordemParada: 'asc' } } },
  });
  geocodificarDestinos(completa.entregas);
  return completa;
}

// ---------------------------------------------------------------- posição

/** RN20 — valida e converte. Devolve `{ lat, lng, precisao }`. */
function validarPosicao(dados = {}) {
  const lat = Number(dados.lat);
  const lng = Number(dados.lng);
  if (dados.lat === undefined || dados.lat === null || dados.lat === '' ||
      !Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw erro('Latitude inválida.');
  }
  if (dados.lng === undefined || dados.lng === null || dados.lng === '' ||
      !Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw erro('Longitude inválida.');
  }

  let precisao = null;
  if (dados.precisao !== undefined && dados.precisao !== null && dados.precisao !== '') {
    precisao = Number(dados.precisao);
    if (!Number.isFinite(precisao) || precisao < 0) throw erro('Precisão inválida.');
  }
  return { lat, lng, precisao };
}

/**
 * Registra a posição do entregador.
 * RN19: só na saída em rota e só pelo entregador dela.
 * RN21: posição a menos de 5 s da anterior é descartada, sem erro.
 */
async function registrarPosicao(dados, usuario, agora = new Date()) {
  const posicao = validarPosicao(dados);

  const saida = await prisma.saidaEntrega.findUnique({ where: { emRota: true } });
  if (!saida) throw erro('Não há saída em rota.', 409);
  if (!usuario || saida.entregadorId !== usuario.id) {
    throw erro('Só o entregador da saída envia a posição.', 403);
  }

  // RN21 lê a última posição e só então grava: sem fila, envios simultâneos
  // leem todos a mesma "última" e passam juntos. Aconteceu no teste com
  // celular real — ao desbloquear a tela, o Android disparou de uma vez três
  // envios acumulados, e os três foram gravados no mesmo milissegundo.
  return emFila(saida.id, async () => {
    const ultima = await prisma.posicaoEntrega.findFirst({
      where:   { saidaId: saida.id },
      orderBy: { registradaEm: 'desc' },
    });
    if (ultima && agora.getTime() - new Date(ultima.registradaEm).getTime() < INTERVALO_MINIMO_POSICAO_MS) {
      return { descartada: true };
    }

    const criada = await prisma.posicaoEntrega.create({
      data: { saidaId: saida.id, ...posicao, registradaEm: agora },
    });
    return { descartada: false, posicao: criada };
  });
}

/**
 * Fila por saída, dentro do processo: cada registro de posição espera o
 * anterior da mesma saída terminar. Basta porque o sistema roda numa instância
 * só — a mesma premissa da sessão em memória (docs/SEGURANCA.md, P04). Com
 * várias instâncias, a garantia teria de ir para o banco.
 */
const filasPosicao = new Map();

function emFila(chave, tarefa) {
  const anterior = filasPosicao.get(chave) || Promise.resolve();
  const atual = anterior.then(tarefa, tarefa);
  const fim = atual.catch(() => {});
  filasPosicao.set(chave, fim);
  fim.then(() => { if (filasPosicao.get(chave) === fim) filasPosicao.delete(chave); });
  return atual;
}

// ---------------------------------------------------------------- paradas

/**
 * Marca uma parada como ENTREGUE ou NAO_ENTREGUE.
 * RN22: só entrega PENDENTE da saída em rota, pelo entregador dela ou pelo
 * administrador. Limpa o token (o mapa some para aquele cliente) e libera a
 * OS do índice de pendentes. RN23: NAO_ENTREGUE exige motivo.
 */
async function marcarEntrega(entregaId, resultado, motivo, usuario) {
  if (!['ENTREGUE', 'NAO_ENTREGUE'].includes(resultado)) throw erro('Resultado inválido.');

  const entrega = await prisma.entregaOS.findUnique({
    where:   { id: Number(entregaId) },
    include: { saida: true, ordem: { select: { numero: true } } },
  });
  if (!entrega) throw erro('Entrega não encontrada.', 404);

  if (!usuario || (entrega.saida.entregadorId !== usuario.id && !ehAdmin(usuario))) {
    throw erro('Só o entregador da saída ou o administrador marcam a entrega.', 403);
  }
  if (entrega.saida.status !== 'EM_ROTA') throw erro('Esta saída já foi encerrada.');
  if (entrega.status !== 'PENDENTE') throw erro(`A OS ${entrega.ordem.numero} já foi marcada.`);

  const texto = String(motivo || '').trim();
  if (resultado === 'NAO_ENTREGUE' && texto.length < MOTIVO_MINIMO) {
    throw erro(`Informe o motivo da não entrega (mínimo de ${MOTIVO_MINIMO} caracteres).`);
  }

  return prisma.entregaOS.update({
    where: { id: entrega.id },
    data: {
      status:          resultado,
      entregueEm:      resultado === 'ENTREGUE' ? new Date() : null,
      motivo:          resultado === 'NAO_ENTREGUE' ? texto.slice(0, 200) : null,
      ordemPendenteId: null,
      tokenHash:       null,
    },
  });
}

/**
 * RN24 — encerra a saída em rota. Exige que nenhuma parada esteja pendente:
 * cada OS precisa terminar como entregue ou não entregue.
 */
async function encerrarSaida(usuario) {
  const saida = await saidaAtiva();
  if (!saida) throw erro('Não há saída em rota.', 409);
  if (!usuario || (saida.entregadorId !== usuario.id && !ehAdmin(usuario))) {
    throw erro('Só o entregador da saída ou o administrador encerram a saída.', 403);
  }

  const pendentes = saida.entregas.filter((e) => e.status === 'PENDENTE');
  if (pendentes.length > 0) {
    const lista = pendentes.map((e) => e.ordem.numero).join(', ');
    throw erro(`Ainda há entregas pendentes: ${lista}. Marque cada uma como entregue ou não entregue.`);
  }

  return prisma.saidaEntrega.update({
    where: { id: saida.id },
    data:  { status: 'CONCLUIDA', emRota: null, encerradaEm: new Date() },
  });
}

/**
 * RN25 — cancela a saída. Só administrador. As pendentes viram NAO_ENTREGUE
 * com motivo "Saída cancelada", e todos os tokens são limpos. Atualização
 * entrega a entrega, para a auditoria registrar cada uma.
 */
async function cancelarSaida(saidaId, usuario) {
  if (!ehAdmin(usuario)) throw erro('Só o administrador cancela a saída.', 403);

  const saida = await prisma.saidaEntrega.findUnique({
    where:   { id: Number(saidaId) },
    include: { entregas: true },
  });
  if (!saida) throw erro('Saída não encontrada.', 404);
  if (saida.status !== 'EM_ROTA') throw erro('Só uma saída em rota pode ser cancelada.');

  return prisma.$transaction(async (tx) => {
    for (const e of saida.entregas) {
      const pendente = e.status === 'PENDENTE';
      if (!pendente && e.tokenHash === null) continue;
      await tx.entregaOS.update({
        where: { id: e.id },
        data: pendente
          ? { status: 'NAO_ENTREGUE', motivo: MOTIVO_CANCELAMENTO, ordemPendenteId: null, tokenHash: null }
          : { tokenHash: null },
      });
    }
    return tx.saidaEntrega.update({
      where: { id: saida.id },
      data:  { status: 'CANCELADA', emRota: null, encerradaEm: new Date() },
    });
  });
}

module.exports = {
  DIAS_ELEGIVEL,
  INTERVALO_MINIMO_POSICAO_MS,
  MOTIVO_MINIMO,
  MOTIVO_CANCELAMENTO,
  listarElegiveis,
  saidaAtiva,
  iniciarSaida,
  validarPosicao,
  registrarPosicao,
  marcarEntrega,
  encerrarSaida,
  cancelarSaida,
  aguardarGeocodificacoes,
};
