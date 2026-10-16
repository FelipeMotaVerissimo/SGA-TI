/**
 * Massa mínima e determinística para os testes de integração.
 *
 * Não confundir com a massa de demonstração: aqui só existe o suficiente
 * para exercitar as regras, e tudo é apagado e recriado a cada suíte. Nada
 * disso vai para o banco de desenvolvimento (ver tests/helpers/ambiente.js).
 */

const bcrypt = require('bcrypt');
const prisma = require('../../src/config/database');
const { aguardarGravacoes } = require('../../src/services/auditoriaExtensao');
const { memoriaLogin, memoriaConsulta } = require('../../src/config/seguranca');

const SENHA = 'teste123';

/** Data deslocada em N dias (negativo = passado). */
const dias = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
};

async function limpar() {
  // NF007: as suítes rodam no mesmo processo, e as tentativas de login falhas
  // que um arquivo cria de propósito contariam para o seguinte.
  if (memoriaLogin && typeof memoriaLogin.resetAll === 'function') memoriaLogin.resetAll();
  if (memoriaConsulta && typeof memoriaConsulta.resetAll === 'function') memoriaConsulta.resetAll();

  // NF005: o log é gravado sem `await`. Uma gravação atrasada do teste anterior
  // cairia depois desta limpeza e apareceria no teste seguinte com outro autor.
  await aguardarGravacoes();

  // NF005: os logs saem primeiro — referenciam usuarios, e sem limpar aqui um
  // teste enxergaria a auditoria gerada pelo teste anterior.
  await prisma.logAuditoria.deleteMany();
  // Módulo 6: entregas referenciam OS, saídas e usuários (RESTRICT).
  await prisma.posicaoEntrega.deleteMany();
  await prisma.entregaOS.deleteMany();
  await prisma.saidaEntrega.deleteMany();
  await prisma.contaReceber.deleteMany();
  await prisma.contaPagar.deleteMany();
  await prisma.movimentoEstoque.deleteMany();
  await prisma.itemOrdem.deleteMany();
  await prisma.servicoExecutado.deleteMany();
  await prisma.tipoServico.deleteMany();
  await prisma.ordemServico.deleteMany();
  await prisma.equipamento.deleteMany();
  await prisma.cliente.deleteMany();
  await prisma.produto.deleteMany();
  await prisma.usuario.deleteMany();
  await prisma.perfil.deleteMany();
}

async function semear() {
  await limpar();

  // ---------------------------------------------------------- perfis/usuários
  const perfis = {};
  for (const nomePerfil of ['ADMINISTRADOR', 'ATENDENTE', 'TECNICO', 'VENDEDOR', 'FINANCEIRO', 'COMPRAS', 'ENTREGADOR']) {
    perfis[nomePerfil] = await prisma.perfil.create({ data: { nomePerfil } });
  }

  const senha = await bcrypt.hash(SENHA, 10);
  const usuarios = {};
  for (const [login, perfil] of [
    ['admin',      'ADMINISTRADOR'],
    ['atendente',  'ATENDENTE'],
    ['tecnico',    'TECNICO'],
    ['vendedor',   'VENDEDOR'],
    ['financeiro', 'FINANCEIRO'],
    ['compras',    'COMPRAS'],
    ['entregador', 'ENTREGADOR'],
  ]) {
    usuarios[login] = await prisma.usuario.create({
      data: { nome: `Usuario ${login}`, login, senha, perfilId: perfis[perfil].id },
    });
  }

  // ------------------------------------------------------ cliente/equipamentos
  const cliente = await prisma.cliente.create({
    data: {
      nome: 'Cliente de Teste', cpfCnpj: '111.222.333-44',
      cidade: 'Dourados', estado: 'MS', email: 'cliente@teste.com',
    },
  });

  const equipamento = await prisma.equipamento.create({
    data: {
      codigo: 'EQ-TESTE-1', tipo: 'NOTEBOOK', marca: 'Dell', modelo: 'Inspiron',
      defeito: 'Não liga', clienteId: cliente.id,
    },
  });

  // ------------------------------------------- catálogo de tipos (Módulo 5)
  const tiposServico = {
    tela:    await prisma.tipoServico.create({ data: { nome: 'Troca de tela' } }),
    limpeza: await prisma.tipoServico.create({ data: { nome: 'Limpeza interna' } }),
    inativo: await prisma.tipoServico.create({ data: { nome: 'Tipo aposentado', ativo: false } }),
  };

  // ------------------------------------------------------------------ produtos
  // O saldo nasce de um movimento de ENTRADA, como no cadastro real — senão o
  // razão não fecha com o saldo e o teste de conciliação acusa (corretamente).
  async function criarProduto(dados) {
    const produto = await prisma.produto.create({ data: dados });
    if (dados.estoque > 0) {
      await prisma.movimentoEstoque.create({
        data: {
          tipo: 'ENTRADA', quantidade: dados.estoque,
          descricao: 'Estoque inicial do cadastro',
          produtoId: produto.id, usuarioId: usuarios.compras.id,
        },
      });
    }
    return produto;
  }

  const produtos = {
    normal:  await criarProduto({ nome: 'Peça com estoque',    preco: 100.00, estoque: 10 }),
    zerado:  await criarProduto({ nome: 'Peça sem estoque',     preco: 50.00,  estoque: 0 }),
    inativo: await criarProduto({ nome: 'Peça descontinuada',   preco: 30.00,  estoque: 5, ativo: false }),
  };

  // ------------------------------------------------------------------- ordens
  const base = (numero, status, extra = {}) => ({
    numero, status, defeitoRelatado: 'Defeito relatado no teste',
    equipamentoId: equipamento.id, usuarioId: usuarios.atendente.id, ...extra,
  });

  const ordens = {
    inicial:    await prisma.ordemServico.create({ data: base('OS-T-001', 'INICIAL') }),
    orcamento:  await prisma.ordemServico.create({ data: base('OS-T-002', 'ORCAMENTO', { valorOrcamento: 320.00 }) }),
    autorizado: await prisma.ordemServico.create({ data: base('OS-T-003', 'AUTORIZADO', { valorOrcamento: 450.00, dataAprovacao: dias(-1) }) }),
    andamento:  await prisma.ordemServico.create({ data: base('OS-T-004', 'EM_ANDAMENTO', { valorOrcamento: 890.00, dataAprovacao: dias(-5) }) }),
    finalizado: await prisma.ordemServico.create({ data: base('OS-T-005', 'FINALIZADO', { valorOrcamento: 260.00, dataFechamento: dias(-2) }) }),
    cancelado:  await prisma.ordemServico.create({ data: base('OS-T-006', 'CANCELADO') }),
  };

  // ------------------------------------------- serviços cobrindo as garantias
  const servicos = {
    emGarantia: await prisma.servicoExecutado.create({
      data: { ordemId: ordens.andamento.id, descricao: 'Servico com garantia vigente', garantiaDias: 90,
              executadoEm: dias(-10), tipoServicoId: tiposServico.tela.id },
    }),
    vencida: await prisma.servicoExecutado.create({
      data: { ordemId: ordens.andamento.id, descricao: 'Servico com garantia vencida', garantiaDias: 7,
              executadoEm: dias(-30), tipoServicoId: tiposServico.tela.id },
    }),
    semGarantia: await prisma.servicoExecutado.create({
      data: { ordemId: ordens.andamento.id, descricao: 'Servico sem garantia', garantiaDias: null,
              executadoEm: dias(-3), tipoServicoId: tiposServico.limpeza.id },
    }),
    // sem tipo, de propósito: alimenta a linha "Não classificado" do RF017
    naoClassificado: await prisma.servicoExecutado.create({
      data: { ordemId: ordens.andamento.id, descricao: 'Servico sem classificacao', garantiaDias: null,
              executadoEm: dias(-5) },
    }),
  };

  // --------------------------------------------------------------- financeiro
  const contas = {
    pagarAberta: await prisma.contaPagar.create({
      data: { descricao: 'Conta a pagar aberta', valor: 1000.00, vencimento: dias(10), fornecedor: 'Fornecedor Teste' },
    }),
    receberAberta: await prisma.contaReceber.create({
      data: { descricao: 'Conta a receber aberta', valor: 300.00, vencimento: dias(5), clienteId: cliente.id },
    }),
  };

  // NF005: a gravação do log é disparada sem `await` (ver auditoriaExtensao).
  // Sem esperar aqui, um teste que conta registros de auditoria contaria junto
  // os que a própria semeadura ainda estava gravando.
  await aguardarGravacoes();

  return { perfis, usuarios, cliente, equipamento, produtos, ordens, servicos, tiposServico, contas, SENHA };
}

/**
 * Lê o token CSRF do formulário "Sair", presente em toda tela autenticada.
 * Segue o redirecionamento: o ENTREGADOR é mandado do dashboard para a tela
 * de entregas (Módulo 6), e a resposta do redirect não tem formulário.
 */
async function lerTokenCsrf(agente) {
  const res = await agente.get('/dashboard').redirects(2);
  const m = res.text.match(/name="_csrf" value="([0-9a-f]{64})"/);
  return m ? m[1] : null;
}

/**
 * Faz login e devolve um agente do Supertest com a sessão já ativa.
 *
 * NF007: toda escrita do agente leva o token CSRF da sessão no cabeçalho
 * `X-CSRF-Token`, como o formulário faria com o campo `_csrf`. Assim os testes
 * de regra de negócio não precisam saber do token. Quem quer testar o CSRF em
 * si usa `request.agent(app)` direto (ver `tests/integration/csrf.test.js`).
 */
async function logar(request, app, login) {
  const agente = request.agent(app);
  await agente.post('/login').type('form').send({ login, senha: SENHA });

  const token = await lerTokenCsrf(agente);
  for (const metodo of ['post', 'put', 'patch', 'delete']) {
    const original = agente[metodo].bind(agente);
    agente[metodo] = (...args) => {
      const req = original(...args);
      return token ? req.set('X-CSRF-Token', token) : req;
    };
  }
  return agente;
}

/** Saldo atual de um produto, lido direto do banco. */
const saldo = async (id) => (await prisma.produto.findUnique({ where: { id } })).estoque;

module.exports = { semear, limpar, logar, lerTokenCsrf, saldo, dias, SENHA, prisma };
