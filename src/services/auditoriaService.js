const prisma = require('../config/database');
const { resolverPeriodo } = require('./relatorioService');

/**
 * NF005 — consulta do log de auditoria.
 *
 * Este service **só lê**. Não existe função de criar, alterar ou excluir log:
 * a gravação é exclusividade da extensão do Prisma (`auditoriaExtensao.js`), e
 * nenhuma rota do sistema oferece caminho para apagar um registro. É o que dá
 * sentido à palavra "rastreabilidade" — um log que o operador pode editar não
 * prova nada.
 *
 * O período reaproveita `resolverPeriodo` dos relatórios, que já resolve as
 * armadilhas de fuso: data final valendo até 23:59:59 e datas montadas no fuso
 * local, não em UTC.
 */

/** Teto de linhas por consulta. O log cresce rápido; a tela não pagina. */
const LIMITE_PADRAO = 200;

function erro(mensagem, status = 400) {
  return Object.assign(new Error(mensagem), { status });
}

/**
 * Lista os registros do período, do mais recente para o mais antigo.
 *
 * Filtros aceitos: `de`, `ate`, `usuarioId`, `entidade`, `acao`.
 */
async function listar(filtros = {}) {
  const { de, ate } = resolverPeriodo(filtros);

  const onde = { criadoEm: { gte: de, lte: ate } };

  if (filtros.usuarioId && String(filtros.usuarioId).trim() !== '') {
    const id = Number(filtros.usuarioId);
    if (!Number.isInteger(id) || id <= 0) throw erro('Usuário inválido no filtro.');
    onde.usuarioId = id;
  }

  if (filtros.entidade && String(filtros.entidade).trim() !== '') {
    onde.entidade = String(filtros.entidade).trim();
  }

  if (filtros.acao && String(filtros.acao).trim() !== '') {
    onde.acao = String(filtros.acao).trim().toUpperCase();
  }

  const limite = Number(filtros.limite) > 0 ? Number(filtros.limite) : LIMITE_PADRAO;

  // O total vem separado para a tela poder avisar quando houver mais registros
  // do que o limite mostra — esconder isso faria o gestor achar que viu tudo.
  const [registros, total] = await Promise.all([
    prisma.logAuditoria.findMany({
      where:   onde,
      include: { usuario: { select: { id: true, nome: true, login: true } } },
      orderBy: { criadoEm: 'desc' },
      take:    limite,
    }),
    prisma.logAuditoria.count({ where: onde }),
  ]);

  return {
    registros,
    total,
    limite,
    truncado: total > registros.length,
    periodo: { de, ate },
  };
}

/**
 * Entidades e usuários que de fato aparecem no log, para montar os filtros.
 * Oferecer a lista completa de models e usuários encheria o select de opções
 * que não devolvem nada.
 */
async function opcoesDeFiltro() {
  const [entidades, usuarios] = await Promise.all([
    prisma.logAuditoria.findMany({
      distinct: ['entidade'],
      select:   { entidade: true },
      orderBy:  { entidade: 'asc' },
    }),
    prisma.logAuditoria.findMany({
      where:    { usuarioId: { not: null } },
      distinct: ['usuarioId'],
      select:   { usuario: { select: { id: true, nome: true, login: true } } },
    }),
  ]);

  return {
    entidades: entidades.map((e) => e.entidade),
    usuarios: usuarios
      .map((u) => u.usuario)
      .filter(Boolean)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
  };
}

/** Converte o JSON gravado em pares legíveis para a tela. */
function formatarValor(json) {
  if (!json) return [];
  try {
    const objeto = JSON.parse(json);
    if (!objeto || typeof objeto !== 'object') return [];
    return Object.entries(objeto).map(([campo, valor]) => ({
      campo,
      valor: valor === null || valor === undefined ? '—' : String(valor),
    }));
  } catch {
    return [{ campo: 'conteúdo', valor: String(json) }];
  }
}

/**
 * Compara anterior e novo e devolve só o que mudou.
 * Numa alteração de cliente que muda o telefone, o gestor quer ver o telefone,
 * não os quinze campos que vieram iguais no `data`.
 */
function diferencas(registro) {
  const antes = registro.valorAnterior ? JSON.parse(registro.valorAnterior) : null;
  const depois = registro.valorNovo ? JSON.parse(registro.valorNovo) : null;

  if (!depois) return [];

  return Object.keys(depois)
    .filter((campo) => !antes || JSON.stringify(antes[campo]) !== JSON.stringify(depois[campo]))
    .map((campo) => ({
      campo,
      de:   antes && antes[campo] !== undefined && antes[campo] !== null ? String(antes[campo]) : '—',
      para: depois[campo] === null || depois[campo] === undefined ? '—' : String(depois[campo]),
    }));
}

module.exports = { LIMITE_PADRAO, listar, opcoesDeFiltro, formatarValor, diferencas };
