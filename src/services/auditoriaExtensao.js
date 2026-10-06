const contexto = require('../config/contextoRequisicao');

/**
 * NF005 — rastreabilidade automática.
 *
 * Em vez de chamar um `registrarLog()` em cada controller — que falha no dia em
 * que alguém esquece —, a gravação é pendurada no próprio Prisma Client, via
 * extensão. Toda escrita em qualquer model passa por aqui, inclusive as que
 * acontecem dentro de `$transaction`.
 *
 * Decisões que valem explicar:
 *
 *  - **O log é gravado pelo cliente base, fora da transação do negócio, e sem
 *    `await`.** Os dois detalhes importam. Fora da transação, porque uma falha
 *    ao gravar o log não pode derrubar a operação real. Sem `await`, porque
 *    esperar a gravação de dentro de uma `$transaction` **trava**: no SQLite a
 *    transação segura o lock de escrita, a inserção do log entra na fila atrás
 *    dela, e a transação fica esperando o log que espera a transação. Isso foi
 *    encontrado em teste — os casos que passam por `$transaction` estouravam
 *    por timeout. Sem o `await`, a transação fecha, libera o lock e a inserção
 *    segue.
 *
 *    A contrapartida é que uma transação que sofra rollback pode deixar um
 *    registro de algo que não persistiu. Entre perder a operação e ter um log a
 *    mais, o log a mais é o mal menor: ele registra a tentativa, que também é
 *    informação de auditoria.
 *
 *  - **Falha ao gravar o log nunca propaga.** O `catch` é silencioso de
 *    propósito: auditoria não pode derrubar atendimento no balcão.
 *
 *  - **`senha` nunca entra no log.** O registro diz que a senha mudou, jamais
 *    qual é — nem o hash.
 */

/** Models que não são auditados, para não gerar recursão nem ruído. */
const MODELS_IGNORADOS = new Set(['LogAuditoria']);

/** Campos que nunca podem ser gravados no log, em nenhum model. */
const CAMPOS_SENSIVEIS = new Set(['senha']);

/** Operações de escrita que o Prisma expõe, mapeadas para a ação do log. */
const ACAO_POR_OPERACAO = {
  create:     'INCLUSAO',
  createMany: 'INCLUSAO',
  update:     'ALTERACAO',
  updateMany: 'ALTERACAO',
  upsert:     'ALTERACAO',
  delete:     'EXCLUSAO',
  deleteMany: 'EXCLUSAO',
};

/** Operações que atingem exatamente um registro identificável por `where`. */
const OPERACOES_REGISTRO_UNICO = new Set(['update', 'delete', 'upsert']);

/**
 * Remove os campos sensíveis e devolve JSON, ou `null` se não houver nada.
 * O marcador deixa explícito que o campo existia e foi omitido — some do log
 * sem isso pareceria que a senha não mudou.
 */
function serializar(valor) {
  if (!valor || typeof valor !== 'object') return null;

  const limpo = {};
  for (const [chave, conteudo] of Object.entries(valor)) {
    if (CAMPOS_SENSIVEIS.has(chave)) {
      limpo[chave] = '[omitido]';
      continue;
    }
    // Decimal e Date do Prisma não sobrevivem ao JSON.stringify como texto útil.
    limpo[chave] = conteudo instanceof Date ? conteudo.toISOString() : conteudo;
  }

  try {
    return JSON.stringify(limpo);
  } catch {
    return null; // referência circular: melhor log sem valor do que log quebrado
  }
}

/** Id do registro atingido, quando dá para saber antes de executar. */
function extrairRegistroId(args) {
  const id = args && args.where && args.where.id;
  return Number.isInteger(id) ? id : null;
}

/**
 * Monta a extensão. Recebe o cliente **base** (não estendido) para gravar o
 * log: usar o estendido faria a gravação do log disparar a extensão de novo.
 */
const pendentes = new Set();

/**
 * Espera as gravações de log em voo.
 *
 * Como a gravação é disparada sem `await` (ver cabeçalho), quem precisa de
 * determinismo — os testes, e scripts que encerram o processo logo depois —
 * chama isto antes de conferir o resultado. Em produção ninguém chama: a
 * gravação simplesmente acontece.
 */
async function aguardarGravacoes() {
  while (pendentes.size > 0) {
    await Promise.all([...pendentes]);
  }
}

function criarExtensao(clienteBase) {
  /** Dispara a gravação e devolve na hora. Nunca rejeita. */
  function gravar(dados) {
    const promessa = clienteBase.logAuditoria
      .create({ data: dados })
      .catch(() => {
        // Auditoria não derruba operação. Ver o cabeçalho deste arquivo.
      })
      .finally(() => pendentes.delete(promessa));

    pendentes.add(promessa);
    return promessa;
  }

  return {
    name: 'auditoria-nf005',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const acao = ACAO_POR_OPERACAO[operation];

          if (!acao || MODELS_IGNORADOS.has(model)) return query(args);

          // O estado anterior só existe antes de executar, e só faz sentido
          // quando a operação atinge um registro único.
          let valorAnterior = null;
          if (OPERACOES_REGISTRO_UNICO.has(operation) && args && args.where) {
            try {
              const antes = await clienteBase[model[0].toLowerCase() + model.slice(1)]
                .findUnique({ where: args.where });
              valorAnterior = serializar(antes);
            } catch {
              // `where` composto ou registro inexistente: segue sem o anterior.
            }
          }

          const resultado = await query(args);

          const registroId =
            (resultado && Number.isInteger(resultado.id) ? resultado.id : null) ||
            extrairRegistroId(args);

          const ctx = contexto.obter();

          // Sem `await`: esperar aqui trava quando a operação está dentro de
          // uma $transaction. Ver o cabeçalho.
          gravar({
            entidade:      model,
            registroId,
            acao,
            valorAnterior,
            valorNovo:     serializar(operation === 'delete' ? null : (args && (args.data || args.create))),
            ip:            ctx ? ctx.ip || null : null,
            usuarioId:     ctx ? ctx.usuarioId || null : null,
          });

          return resultado;
        },
      },
    },
  };
}

module.exports = {
  criarExtensao,
  aguardarGravacoes,
  // exportados para teste
  serializar,
  ACAO_POR_OPERACAO,
  MODELS_IGNORADOS,
  CAMPOS_SENSIVEIS,
};
