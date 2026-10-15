const prisma = require('../config/database');
const { aguardarGravacoes } = require('./auditoriaExtensao');

/**
 * NF008 — retenção e descarte de dados pessoais.
 *
 * Atende ao direito do titular previsto no **art. 18 da LGPD**, em especial os
 * incisos IV (anonimização, bloqueio ou eliminação de dados desnecessários) e
 * VI (eliminação dos dados tratados com consentimento).
 *
 * O conflito que este módulo resolve: o titular pode exigir a eliminação dos
 * seus dados, mas a assistência **não pode** simplesmente apagar o cliente —
 * as ordens de serviço são documento fiscal e operacional, e o banco sequer
 * permitiria (as FKs são `ON DELETE RESTRICT`).
 *
 * A saída prevista na própria lei é a **anonimização**: o registro continua
 * existindo e sustentando o histórico, mas deixa de ser atribuível a uma pessoa
 * identificável. O art. 12 é explícito ao dizer que dado anonimizado não é dado
 * pessoal.
 *
 * ---
 *
 * **Onde o dado pessoal vive.** Anonimizar o cadastro não basta: o dado é
 * copiado para outros lugares, e cada um precisa ser tratado.
 *
 *   | Onde                               | Como chegou lá                      |
 *   |------------------------------------|-------------------------------------|
 *   | `clientes`                         | o próprio cadastro                  |
 *   | `contas_receber.descricao`         | o faturamento copia o nome ("OS 108 — Joana Silva") |
 *   | `logs_auditoria` do cliente        | estado anterior de cada alteração   |
 *   | `logs_auditoria` das contas        | a descrição acima, gravada no log   |
 *
 * As duas linhas do meio foram descobertas **depois** da primeira versão, numa
 * captura de tela do manual: a lista de contas mostrava "Cliente anonimizado"
 * na coluna do cliente e o nome completo na descrição.
 */

/**
 * Campos pessoais que são apagados do cadastro.
 *
 * `cidade` e `estado` **permanecem**, e isso é decisão consciente: sozinhos não
 * identificam ninguém, e são o que sustenta a análise geográfica do NF004. Um
 * município não é dado pessoal; o endereço dentro dele é, e esse sai.
 */
const CAMPOS_ANONIMIZADOS = [
  'rg', 'dataNascimento', 'endereco', 'numero', 'bairro',
  'cep', 'telefone', 'celular', 'email',
];

/** O que fica no lugar do nome. */
const NOME_ANONIMO = 'Cliente anonimizado';

/** O que fica no lugar dos demais dados, nos textos e no log. */
const MARCA_NO_LOG = '[apagado — LGPD art. 18]';

/**
 * Campos do cliente que identificam a pessoa e, por isso, saem também do log.
 * Mesma lista da anonimização, mais o nome e o documento.
 */
const CAMPOS_PESSOAIS_NO_LOG = ['nome', 'cpfCnpj', ...CAMPOS_ANONIMIZADOS];

/**
 * Campos cujo VALOR é procurado e substituído dentro de textos livres
 * (descrição de conta, conteúdo de log).
 *
 * `numero` (da casa) e `dataNascimento` ficam de fora de propósito: "12" ou
 * uma data são curtos e genéricos demais — substituí-los em texto livre
 * apagaria números que não têm nada a ver com o titular.
 */
const CAMPOS_PROCURADOS_EM_TEXTO = ['nome', 'cpfCnpj', 'rg', 'email', 'telefone', 'celular', 'endereco', 'cep'];

/** Valor curto demais para ser procurado em texto livre sem falso positivo. */
const TAMANHO_MINIMO_PROCURADO = 4;

/**
 * Formato da descrição que o faturamento gera: `OS <número> — <nome>`.
 * Ver `financeiroService.gerarContaDaOrdem`.
 */
const DESCRICAO_GERADA = /^(OS \S+) — .+$/;

function erro(mensagem, status = 400) {
  return Object.assign(new Error(mensagem), { status });
}

/**
 * Identificador que substitui o CPF/CNPJ.
 *
 * `cpfCnpj` é `UNIQUE` e `NOT NULL`, então não dá para esvaziar: dois clientes
 * anonimizados colidiriam. Usar o id garante unicidade e cabe no `VarChar(18)`.
 * O prefixo deixa o registro reconhecível numa consulta ao banco.
 */
function documentoAnonimo(id) {
  return `ANON-${id}`;
}

/** Já passou pela anonimização? */
function estaAnonimizado(cliente) {
  return Boolean(cliente && cliente.anonimizadoEm);
}

// --------------------------------------------------------------------------
// Substituição em texto livre
// --------------------------------------------------------------------------

/**
 * Pares [valor original → substituto] a procurar em texto, do mais longo para
 * o mais curto — senão um pedaço do nome seria trocado antes do nome inteiro.
 */
function paresDeSubstituicao(originais) {
  const pares = [];
  for (const campo of CAMPOS_PROCURADOS_EM_TEXTO) {
    const valor = originais && originais[campo];
    if (typeof valor !== 'string') continue;

    const limpo = valor.trim();
    if (limpo.length < TAMANHO_MINIMO_PROCURADO) continue;
    if (limpo === NOME_ANONIMO || limpo === MARCA_NO_LOG || limpo.startsWith('ANON-')) continue;

    pares.push([limpo, campo === 'nome' ? NOME_ANONIMO : MARCA_NO_LOG]);
  }
  return pares.sort((a, b) => b[0].length - a[0].length);
}

/** Troca, num texto, cada ocorrência dos dados originais pelo substituto. */
function substituirEmTexto(texto, pares) {
  if (typeof texto !== 'string' || !texto) return texto;
  let saida = texto;
  for (const [original, substituto] of pares) {
    saida = saida.split(original).join(substituto); // sem regex: o valor pode ter ( ) . + -
  }
  return saida;
}

/** A descrição gerada pelo faturamento, sem o nome — mesmo sem saber qual era. */
function normalizarDescricaoGerada(descricao) {
  if (typeof descricao !== 'string') return descricao;
  return descricao.replace(DESCRICAO_GERADA, `$1 — ${NOME_ANONIMO}`);
}

/** Percorre um valor JSON e aplica `fn` a cada string, em qualquer profundidade. */
function mapearStrings(valor, fn) {
  if (typeof valor === 'string') return fn(valor);
  if (Array.isArray(valor)) return valor.map((v) => mapearStrings(v, fn));
  if (valor && typeof valor === 'object') {
    const saida = {};
    for (const [k, v] of Object.entries(valor)) saida[k] = mapearStrings(v, fn);
    return saida;
  }
  return valor;
}

// --------------------------------------------------------------------------
// Redação do log
// --------------------------------------------------------------------------

/**
 * Redige o JSON de um registro de log.
 *
 * - `porCampo`: troca o valor dos campos pessoais pela marca (log do cliente);
 * - `pares`: procura os dados originais em qualquer texto (log das contas);
 * - `descricaoGerada`: normaliza o campo `descricao` no formato do faturamento.
 */
function redigir(json, { porCampo = false, pares = [], descricaoGerada = false } = {}) {
  if (!json) return { texto: json, alterou: false };

  let objeto;
  try { objeto = JSON.parse(json); } catch { return { texto: json, alterou: false }; }
  if (!objeto || typeof objeto !== 'object') return { texto: json, alterou: false };

  if (porCampo) {
    for (const campo of CAMPOS_PESSOAIS_NO_LOG) {
      if (campo in objeto && objeto[campo] !== null && objeto[campo] !== MARCA_NO_LOG) {
        objeto[campo] = MARCA_NO_LOG;
      }
    }
  }

  if (pares.length) objeto = mapearStrings(objeto, (s) => substituirEmTexto(s, pares));

  if (descricaoGerada && typeof objeto.descricao === 'string') {
    objeto.descricao = normalizarDescricaoGerada(objeto.descricao);
  }

  const texto = JSON.stringify(objeto);
  return { texto, alterou: texto !== json };
}

/** Aplica `redigir` a uma lista de registros de log e grava os que mudaram. */
async function redigirRegistros(registros, opcoes) {
  let redigidos = 0;
  for (const r of registros) {
    const anterior = redigir(r.valorAnterior, opcoes(r));
    const novo     = redigir(r.valorNovo, opcoes(r));
    if (!anterior.alterou && !novo.alterou) continue;

    await prisma.logAuditoria.update({
      where: { id: r.id },
      data:  { valorAnterior: anterior.texto, valorNovo: novo.texto },
    });
    redigidos += 1;
  }
  return redigidos;
}

// --------------------------------------------------------------------------
// Vestígios fora do cadastro
// --------------------------------------------------------------------------

/**
 * RN06 e RN07 — remove os dados pessoais que foram COPIADOS para fora do
 * cadastro do cliente.
 *
 * **Redige, não apaga.** Remover as contas ou as linhas do log destruiria o
 * histórico fiscal e a rastreabilidade (NF005). Aqui só os *valores* pessoais
 * são trocados. Continua visível **que** o telefone mudou em tal data, por tal
 * usuário — deixa de ser visível **qual** era.
 *
 * É a única escrita que o sistema faz em `logs_auditoria` fora da gravação
 * automática, e ela é deliberada: o direito do titular (art. 18 da LGPD)
 * prevalece sobre a imutabilidade do log. A regra de que ninguém edita log
 * continua valendo para as pessoas — não há rota para isso.
 *
 * @param clienteId
 * @param originais  os dados do cliente ANTES da anonimização. Pode vir vazio
 *                   (reparo de cliente antigo cujo log já não tem o nome): aí
 *                   só a normalização da descrição gerada atua nas contas.
 */
async function apagarVestigios(clienteId, originais = {}) {
  const id    = Number(clienteId);
  const pares = paresDeSubstituicao(originais);

  // 1. Descrição das contas a receber do cliente.
  const contas = await prisma.contaReceber.findMany({ where: { clienteId: id } });
  const geradas = new Set(contas.filter((c) => c.ordemId !== null).map((c) => c.id));

  let contasRedigidas = 0;
  for (const c of contas) {
    let descricao = substituirEmTexto(c.descricao, pares);
    if (geradas.has(c.id)) descricao = normalizarDescricaoGerada(descricao);
    const observacoes = substituirEmTexto(c.observacoes, pares);

    if (descricao !== c.descricao || observacoes !== c.observacoes) {
      await prisma.contaReceber.update({ where: { id: c.id }, data: { descricao, observacoes } });
      contasRedigidas += 1;
    }
  }

  // 2. Os passos acima — e a própria anonimização, quando houver — geram log
  //    sem `await` (ver auditoriaExtensao). O valorAnterior desses logs traz
  //    justamente o que está sendo apagado. Sem esperar, a limpeza rodaria
  //    antes de eles chegarem ao banco, e eles escapariam.
  await aguardarGravacoes();

  // 3. Log do cliente: por campo, e também por texto.
  const logsCliente = await prisma.logAuditoria.findMany({
    where: { entidade: 'Cliente', registroId: id },
  });
  const logClienteRedigidos = await redigirRegistros(logsCliente, () => ({ porCampo: true, pares }));

  // 4. Log das contas do cliente: por texto, e a descrição gerada.
  const logsContas = contas.length
    ? await prisma.logAuditoria.findMany({
        where: { entidade: 'ContaReceber', registroId: { in: contas.map((c) => c.id) } },
      })
    : [];
  const logContasRedigidos = await redigirRegistros(logsContas, (r) => ({
    pares, descricaoGerada: geradas.has(r.registroId),
  }));

  return { contasRedigidas, logClienteRedigidos, logContasRedigidos };
}

// --------------------------------------------------------------------------
// Operação principal
// --------------------------------------------------------------------------

/**
 * Apaga os dados pessoais do cliente, preservando o histórico.
 *
 * Regras:
 *  - RN01: as ordens de serviço, equipamentos, serviços e contas **não são
 *    apagados**. É o histórico fiscal, e é justamente o que justifica manter o
 *    registro em vez de apagá-lo.
 *  - RN02: a operação é **irreversível**. Não existe "desanonimizar": o dado
 *    foi sobrescrito, não escondido. Esconder seria bloqueio, não eliminação, e
 *    não atenderia ao inciso VI.
 *  - RN03: anonimizar duas vezes é recusado, para a data do primeiro
 *    atendimento ao titular não ser sobrescrita.
 *  - RN04: o cliente também é desativado — anonimizado não entra em OS nova.
 *  - RN05: a operação é auditada automaticamente (NF005). O log registra que
 *    houve anonimização, quando e por quem.
 *  - RN06: os dados pessoais saem também **do log de auditoria**.
 *  - RN07: e de onde o sistema os **copiou** — a descrição das contas a
 *    receber geradas no faturamento, e o log dessas contas.
 */
async function anonimizarCliente(id) {
  const clienteId = Number(id);
  if (!Number.isInteger(clienteId) || clienteId <= 0) {
    throw erro('Cliente inválido.');
  }

  const cliente = await prisma.cliente.findUnique({ where: { id: clienteId } });
  if (!cliente) throw erro('Cliente não encontrado.', 404);

  if (estaAnonimizado(cliente)) {
    throw erro(
      'Este cliente já foi anonimizado em ' +
      new Date(cliente.anonimizadoEm).toLocaleDateString('pt-BR') + '.'
    );
  }

  // Lido ANTES de sobrescrever: depois do update, a única forma de saber o que
  // procurar nas contas e nos logs seria ler o próprio log — que é o que está
  // sendo limpo.
  const originais = { ...cliente };

  const dados = {
    nome:          NOME_ANONIMO,
    cpfCnpj:       documentoAnonimo(clienteId),
    ativo:         false,          // RN04
    anonimizadoEm: new Date(),
  };
  for (const campo of CAMPOS_ANONIMIZADOS) dados[campo] = null;

  const anonimizado = await prisma.cliente.update({ where: { id: clienteId }, data: dados });

  await apagarVestigios(clienteId, originais);   // RN06 e RN07

  return anonimizado;
}

// --------------------------------------------------------------------------
// Reparo de anonimizações antigas
// --------------------------------------------------------------------------

/**
 * Recupera, do log, os dados que o cliente tinha antes de ser anonimizado.
 *
 * Usado só pelo reparo: um cliente anonimizado antes do RN07 já teve o
 * cadastro sobrescrito, então o único lugar onde o nome original ainda está é
 * o `valorAnterior` do registro da anonimização. Se esse registro já foi
 * redigido, devolve vazio — e o reparo cai na normalização da descrição gerada,
 * que funciona sem saber o nome.
 */
async function dadosOriginaisDoLog(clienteId) {
  const registros = await prisma.logAuditoria.findMany({
    where:   { entidade: 'Cliente', registroId: Number(clienteId), acao: 'ALTERACAO' },
    orderBy: { id: 'asc' },
  });

  const daAnonimizacao = registros.find((r) => r.valorNovo && r.valorNovo.includes('"anonimizadoEm"'));
  if (!daAnonimizacao || !daAnonimizacao.valorAnterior) return {};

  try {
    const anterior = JSON.parse(daAnonimizacao.valorAnterior);
    const saida = {};
    for (const campo of CAMPOS_PROCURADOS_EM_TEXTO) {
      if (typeof anterior[campo] === 'string' && anterior[campo] !== MARCA_NO_LOG) saida[campo] = anterior[campo];
    }
    return saida;
  } catch {
    return {};
  }
}

/**
 * Aplica o RN06 e o RN07 a um cliente que JÁ foi anonimizado.
 *
 * Existe porque clientes anonimizados antes destas regras ficaram com o nome
 * na descrição das contas e no log. Idempotente: rodar de novo não muda nada.
 */
async function repararAnonimizacao(clienteId) {
  const cliente = await prisma.cliente.findUnique({ where: { id: Number(clienteId) } });
  if (!cliente) throw erro('Cliente não encontrado.', 404);
  if (!estaAnonimizado(cliente)) throw erro('Este cliente não foi anonimizado.');

  const originais = await dadosOriginaisDoLog(cliente.id);
  return apagarVestigios(cliente.id, originais);
}

/** Repara todos os clientes anonimizados. Devolve um resumo por cliente. */
async function repararTodas() {
  const anonimizados = await prisma.cliente.findMany({
    where: { anonimizadoEm: { not: null } }, select: { id: true },
  });
  const resultado = [];
  for (const { id } of anonimizados) {
    resultado.push({ clienteId: id, ...(await repararAnonimizacao(id)) });
  }
  return resultado;
}

// --------------------------------------------------------------------------

/**
 * O que o cliente ainda sustenta depois de anonimizado.
 *
 * Serve para a tela avisar, antes de confirmar, o que será preservado. Sem isso
 * o operador anonimiza achando que vai apagar tudo.
 */
async function resumoDoVinculo(id) {
  const clienteId = Number(id);

  const [equipamentos, ordens, contas] = await Promise.all([
    prisma.equipamento.count({ where: { clienteId } }),
    prisma.ordemServico.count({ where: { equipamento: { clienteId } } }),
    prisma.contaReceber.count({ where: { clienteId } }),
  ]);

  return { equipamentos, ordens, contas };
}

module.exports = {
  CAMPOS_ANONIMIZADOS,
  CAMPOS_PESSOAIS_NO_LOG,
  CAMPOS_PROCURADOS_EM_TEXTO,
  NOME_ANONIMO,
  MARCA_NO_LOG,
  documentoAnonimo,
  estaAnonimizado,
  anonimizarCliente,
  apagarVestigios,
  repararAnonimizacao,
  repararTodas,
  resumoDoVinculo,
  // expostos para teste
  paresDeSubstituicao,
  substituirEmTexto,
  normalizarDescricaoGerada,
};
