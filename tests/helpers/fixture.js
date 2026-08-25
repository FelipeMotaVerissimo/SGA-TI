/**
 * Massa mínima e determinística para os testes de integração.
 *
 * Não confundir com a massa de demonstração: aqui só existe o suficiente
 * para exercitar as regras, e tudo é apagado e recriado a cada suíte. Nada
 * disso vai para o banco de desenvolvimento (ver tests/helpers/ambiente.js).
 */

const bcrypt = require('bcrypt');
const prisma = require('../../src/config/database');

const SENHA = 'teste123';

/** Data deslocada em N dias (negativo = passado). */
const dias = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
};

async function limpar() {
  await prisma.contaReceber.deleteMany();
  await prisma.contaPagar.deleteMany();
  await prisma.movimentoEstoque.deleteMany();
  await prisma.itemOrdem.deleteMany();
  await prisma.servicoExecutado.deleteMany();
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
  for (const nomePerfil of ['ADMINISTRADOR', 'ATENDENTE', 'TECNICO', 'VENDEDOR', 'FINANCEIRO', 'COMPRAS']) {
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
      codigo: 'EQ-TESTE-1', marca: 'Dell', modelo: 'Inspiron',
      defeito: 'Não liga', clienteId: cliente.id,
    },
  });

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
      data: { ordemId: ordens.andamento.id, descricao: 'Servico com garantia vigente', garantiaDias: 90, executadoEm: dias(-10) },
    }),
    vencida: await prisma.servicoExecutado.create({
      data: { ordemId: ordens.andamento.id, descricao: 'Servico com garantia vencida', garantiaDias: 7, executadoEm: dias(-30) },
    }),
    semGarantia: await prisma.servicoExecutado.create({
      data: { ordemId: ordens.andamento.id, descricao: 'Servico sem garantia', garantiaDias: null, executadoEm: dias(-3) },
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

  return { perfis, usuarios, cliente, equipamento, produtos, ordens, servicos, contas, SENHA };
}

/** Faz login e devolve um agente do Supertest com a sessão já ativa. */
async function logar(request, app, login) {
  const agente = request.agent(app);
  await agente.post('/login').type('form').send({ login, senha: SENHA });
  return agente;
}

/** Saldo atual de um produto, lido direto do banco. */
const saldo = async (id) => (await prisma.produto.findUnique({ where: { id } })).estoque;

module.exports = { semear, limpar, logar, saldo, dias, SENHA, prisma };
