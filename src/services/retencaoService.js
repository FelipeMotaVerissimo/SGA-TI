const prisma = require('../config/database');

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
 */

/**
 * Campos pessoais que são apagados.
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

/**
 * Apaga os dados pessoais do cliente, preservando o histórico.
 *
 * Regras:
 *  - RN01: as ordens de serviço, equipamentos, serviços e contas **não são
 *    tocados**. É o histórico fiscal, e é justamente o que justifica manter o
 *    registro em vez de apagá-lo.
 *  - RN02: a operação é **irreversível**. Não existe "desanonimizar": o dado
 *    foi sobrescrito, não escondido. Esconder seria bloqueio, não eliminação, e
 *    não atenderia ao inciso VI.
 *  - RN03: anonimizar duas vezes é recusado, para a data do primeiro
 *    atendimento ao titular não ser sobrescrita.
 *  - RN04: o cliente também é desativado — anonimizado não entra em OS nova.
 *  - RN05: a operação é auditada automaticamente (NF005), como qualquer
 *    escrita. O log registra que houve anonimização e por quem, **sem** repetir
 *    os dados apagados... ver a observação abaixo.
 *
 * > **Atenção, registrada como pendência P03 em `docs/RETENCAO.md`:** o log de
 * > auditoria do NF005 guarda o estado anterior da alteração, então os dados
 * > pessoais sobrevivem dentro de `logs_auditoria.valorAnterior`. Para a
 * > eliminação ser completa, o log desta operação em particular precisa ser
 * > tratado — hoje ele não é.
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

  const dados = {
    nome:          NOME_ANONIMO,
    cpfCnpj:       documentoAnonimo(clienteId),
    ativo:         false,          // RN04
    anonimizadoEm: new Date(),
  };
  for (const campo of CAMPOS_ANONIMIZADOS) dados[campo] = null;

  return prisma.cliente.update({ where: { id: clienteId }, data: dados });
}

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
  NOME_ANONIMO,
  documentoAnonimo,
  estaAnonimizado,
  anonimizarCliente,
  resumoDoVinculo,
};
