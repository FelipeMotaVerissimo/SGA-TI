/**
 * SGA TI — Fake Prisma (APENAS para o ambiente de preview).
 *
 * Implementa em memória o subconjunto da API do Prisma que o projeto usa.
 * Serve para subir o Express e exercitar rotas, regras de negócio, sessão,
 * flash e views sem precisar de MySQL.
 *
 * NÃO é usado em desenvolvimento nem em produção — o app real continua
 * usando src/config/database.js com o Prisma verdadeiro.
 */

// model -> relação -> { tipo, model, fk, em }
const RELACOES = {
  usuario: {
    perfil: { tipo: 'um',     model: 'perfil',       fk: 'perfilId',  em: 'proprio' },
    ordens: { tipo: 'muitos', model: 'ordemServico', fk: 'usuarioId', em: 'outro' },
  },
  perfil: {
    usuarios: { tipo: 'muitos', model: 'usuario', fk: 'perfilId', em: 'outro' },
  },
  cliente: {
    equipamentos: { tipo: 'muitos', model: 'equipamento', fk: 'clienteId', em: 'outro' },
  },
  equipamento: {
    cliente: { tipo: 'um',     model: 'cliente',      fk: 'clienteId',     em: 'proprio' },
    ordens:  { tipo: 'muitos', model: 'ordemServico', fk: 'equipamentoId', em: 'outro' },
  },
  ordemServico: {
    equipamento: { tipo: 'um',     model: 'equipamento',      fk: 'equipamentoId', em: 'proprio' },
    usuario:     { tipo: 'um',     model: 'usuario',          fk: 'usuarioId',     em: 'proprio' },
    servicos:    { tipo: 'muitos', model: 'servicoExecutado', fk: 'ordemId',       em: 'outro' },
    itens:       { tipo: 'muitos', model: 'itemOrdem',        fk: 'ordemId',       em: 'outro' },
  },
  servicoExecutado: {
    ordem: { tipo: 'um', model: 'ordemServico', fk: 'ordemId', em: 'proprio' },
  },
  produto: {
    itens:      { tipo: 'muitos', model: 'itemOrdem',        fk: 'produtoId', em: 'outro' },
    movimentos: { tipo: 'muitos', model: 'movimentoEstoque', fk: 'produtoId', em: 'outro' },
  },
  itemOrdem: {
    ordem:   { tipo: 'um', model: 'ordemServico', fk: 'ordemId',   em: 'proprio' },
    produto: { tipo: 'um', model: 'produto',      fk: 'produtoId', em: 'proprio' },
  },
  movimentoEstoque: {
    produto: { tipo: 'um', model: 'produto', fk: 'produtoId', em: 'proprio' },
  },
};

const MODELS = Object.keys(RELACOES);

// equivalentes aos @default do schema.prisma
const DEFAULTS = {
  usuario:          () => ({ ativo: true, criadoEm: new Date() }),
  cliente:          () => ({ ativo: true, criadoEm: new Date() }),
  equipamento:      () => ({ criadoEm: new Date() }),
  ordemServico:     () => ({ status: 'INICIAL', dataAbertura: new Date() }),
  servicoExecutado: () => ({ executadoEm: new Date() }),
  produto:          () => ({ estoque: 0, ativo: true, criadoEm: new Date() }),
  movimentoEstoque: () => ({ criadoEm: new Date() }),
};

function criarBanco() {
  const dados = {};
  const seqs = {};
  MODELS.forEach((m) => { dados[m] = []; seqs[m] = 0; });
  return { dados, seqs };
}

let banco = criarBanco();

function proximoId(model) {
  banco.seqs[model] += 1;
  return banco.seqs[model];
}

function resolverRelacao(registro, rel) {
  if (rel.em === 'proprio') {
    return banco.dados[rel.model].find((r) => r.id === registro[rel.fk]) || null;
  }
  return banco.dados[rel.model].filter((r) => r[rel.fk] === registro.id);
}

/** Compara um registro contra um objeto `where` (suporta aninhamento e operadores). */
function combina(registro, where, model) {
  if (!where) return true;

  return Object.entries(where).every(([chave, valor]) => {
    if (chave === 'AND') return valor.every((w) => combina(registro, w, model));
    if (chave === 'OR')  return valor.some((w)  => combina(registro, w, model));
    if (chave === 'NOT') return !combina(registro, valor, model);

    const rel = RELACOES[model] && RELACOES[model][chave];

    // filtro através de relação: { equipamento: { clienteId: 3 } }
    if (rel && valor && typeof valor === 'object' && !(valor instanceof Date)) {
      const alvo = resolverRelacao(registro, rel);
      if (rel.tipo === 'um') return alvo ? combina(alvo, valor, rel.model) : false;
      const lista = alvo || [];
      if (valor.some)  return lista.some((r)  => combina(r, valor.some,  rel.model));
      if (valor.every) return lista.every((r) => combina(r, valor.every, rel.model));
      if (valor.none)  return !lista.some((r) => combina(r, valor.none,  rel.model));
      return lista.some((r) => combina(r, valor, rel.model));
    }

    const atual = registro[chave];

    if (valor && typeof valor === 'object' && !(valor instanceof Date)) {
      if ('equals'   in valor) return atual === valor.equals;
      if ('in'       in valor) return valor.in.includes(atual);
      if ('notIn'    in valor) return !valor.notIn.includes(atual);
      if ('not'      in valor) return atual !== valor.not;
      if ('contains' in valor) {
        const a = String(atual ?? '');
        const b = String(valor.contains);
        return valor.mode === 'insensitive'
          ? a.toLowerCase().includes(b.toLowerCase())
          : a.includes(b);
      }
      if ('gte' in valor) return atual >= valor.gte;
      if ('lte' in valor) return atual <= valor.lte;
      if ('gt'  in valor) return atual >  valor.gt;
      if ('lt'  in valor) return atual <  valor.lt;
    }

    if (atual instanceof Date && valor instanceof Date) return atual.getTime() === valor.getTime();
    return atual === valor;
  });
}

function ordenar(lista, orderBy) {
  const regras = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...lista].sort((a, b) => {
    for (const regra of regras) {
      const [campo, dir] = Object.entries(regra)[0];
      const va = a[campo];
      const vb = b[campo];
      if (va === vb) continue;
      const menor = va < vb ? -1 : 1;
      return dir === 'desc' ? -menor : menor;
    }
    return 0;
  });
}

function aplicarSelect(registro, select) {
  if (!registro || !select) return registro;
  const saida = {};
  for (const [campo, on] of Object.entries(select)) {
    if (on) saida[campo] = registro[campo];
  }
  return saida;
}

function aplicarInclude(registro, model, include) {
  if (!registro) return registro;
  if (!include) return { ...registro };

  const saida = { ...registro };

  for (const [nome, cfg] of Object.entries(include)) {
    if (!cfg) continue;
    const rel = RELACOES[model][nome];
    if (!rel) continue;

    const sub = typeof cfg === 'object' ? cfg : {};
    let valor = resolverRelacao(registro, rel);

    if (rel.tipo === 'um') {
      valor = valor
        ? aplicarSelect(aplicarInclude(valor, rel.model, sub.include), sub.select)
        : null;
    } else {
      let lista = valor;
      if (sub.where)   lista = lista.filter((r) => combina(r, sub.where, rel.model));
      if (sub.orderBy) lista = ordenar(lista, sub.orderBy);
      valor = lista.map((r) =>
        aplicarSelect(aplicarInclude(r, rel.model, sub.include), sub.select)
      );
    }
    saida[nome] = valor;
  }
  return saida;
}

function erroNaoEncontrado(model) {
  const e = new Error(`Registro não encontrado em ${model}.`);
  e.code = 'P2025';
  return e;
}

function criarDelegate(model) {
  const delegate = {
    async findMany(args = {}) {
      let lista = banco.dados[model].filter((r) => combina(r, args.where, model));
      if (args.orderBy) lista = ordenar(lista, args.orderBy);
      if (args.skip)    lista = lista.slice(args.skip);
      if (args.take)    lista = lista.slice(0, args.take);
      return lista.map((r) => aplicarSelect(aplicarInclude(r, model, args.include), args.select));
    },

    async findUnique(args = {}) {
      const r = banco.dados[model].find((x) => combina(x, args.where, model)) || null;
      return r ? aplicarSelect(aplicarInclude(r, model, args.include), args.select) : null;
    },

    async findFirst(args = {}) {
      let lista = banco.dados[model].filter((r) => combina(r, args.where, model));
      if (args.orderBy) lista = ordenar(lista, args.orderBy);
      const r = lista[0] || null;
      return r ? aplicarSelect(aplicarInclude(r, model, args.include), args.select) : null;
    },

    async count(args = {}) {
      return banco.dados[model].filter((r) => combina(r, args.where, model)).length;
    },

    async create(args = {}) {
      const base  = DEFAULTS[model] ? DEFAULTS[model]() : {};
      const dados = { ...args.data };

      // suporte a connect simples: { perfil: { connect: { id: 1 } } }
      for (const [chave, valor] of Object.entries(dados)) {
        const rel = RELACOES[model][chave];
        if (rel && valor && valor.connect) {
          dados[rel.fk] = valor.connect.id;
          delete dados[chave];
        }
      }

      const registro = { id: proximoId(model), ...base, ...dados };
      banco.dados[model].push(registro);
      return aplicarSelect(aplicarInclude(registro, model, args.include), args.select);
    },

    async update(args = {}) {
      const registro = banco.dados[model].find((x) => combina(x, args.where, model));
      if (!registro) throw erroNaoEncontrado(model);
      Object.assign(registro, args.data);
      return aplicarSelect(aplicarInclude(registro, model, args.include), args.select);
    },

    async upsert(args = {}) {
      const existe = banco.dados[model].find((x) => combina(x, args.where, model));
      if (existe) return delegate.update({ where: args.where, data: args.update, include: args.include });
      return delegate.create({ data: args.create, include: args.include });
    },

    async delete(args = {}) {
      const i = banco.dados[model].findIndex((x) => combina(x, args.where, model));
      if (i === -1) throw erroNaoEncontrado(model);
      const [removido] = banco.dados[model].splice(i, 1);
      return removido;
    },

    async deleteMany(args = {}) {
      const antes = banco.dados[model].length;
      banco.dados[model] = banco.dados[model].filter((r) => !combina(r, args.where, model));
      return { count: antes - banco.dados[model].length };
    },
  };

  return delegate;
}

const prisma = {};
MODELS.forEach((m) => { prisma[m] = criarDelegate(m); });

function clonarDados() {
  const copia = {};
  MODELS.forEach((m) => { copia[m] = banco.dados[m].map((r) => ({ ...r })); });
  return copia;
}

/**
 * $transaction: aceita função (transação interativa) ou array de promises.
 * Faz snapshot e restaura em caso de erro — permite testar atomicidade.
 */
prisma.$transaction = async function (arg) {
  if (typeof arg === 'function') {
    const snapshot = clonarDados();
    const seqs = { ...banco.seqs };
    try {
      return await arg(prisma);
    } catch (e) {
      banco.dados = snapshot;
      banco.seqs  = seqs;
      throw e;
    }
  }
  return Promise.all(arg);
};

prisma.$connect    = async () => {};
prisma.$disconnect = async () => {};

// utilitários do harness (não existem no Prisma real)
prisma.__reset = () => { banco = criarBanco(); };
prisma.__banco = () => banco.dados;

module.exports = prisma;
