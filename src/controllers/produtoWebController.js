const produtoService = require('../services/produtoService');

async function listar(req, res) {
  try {
    const incluirInativos = req.query.inativos === '1';
    const busca    = req.query.busca || '';
    const produtos = await produtoService.listarProdutos({ incluirInativos, busca });

    res.render('produtos/listar', {
      titulo: 'Produtos',
      produtos,
      incluirInativos,
      busca,
    });
  } catch (err) {
    req.flash('erro', err.message);
    res.redirect('/dashboard');
  }
}

function exibirForm(req, res) {
  res.render('produtos/form', { titulo: 'Novo Produto', produto: null });
}

async function criar(req, res) {
  try {
    await produtoService.criarProduto(req.body);
    req.flash('sucesso', 'Produto cadastrado com sucesso!');
    res.redirect('/produtos');
  } catch (err) {
    // Renderiza de volta o formulário preenchido. O erro vai direto para a view:
    // um req.flash() aqui só apareceria na requisição seguinte, porque
    // res.locals.erro já foi resolvido no início desta.
    res.render('produtos/form', {
      titulo:  'Novo Produto',
      produto: req.body,
      erro:    [err.message],
    });
  }
}

async function exibirEditar(req, res) {
  try {
    const produto = await produtoService.buscarProdutoPorId(req.params.id);
    res.render('produtos/form', { titulo: 'Editar Produto', produto });
  } catch (err) {
    req.flash('erro', err.message);
    res.redirect('/produtos');
  }
}

async function atualizar(req, res) {
  try {
    await produtoService.atualizarProduto(req.params.id, req.body);
    req.flash('sucesso', 'Produto atualizado com sucesso!');
    res.redirect('/produtos');
  } catch (err) {
    req.flash('erro', err.message);
    res.redirect(`/produtos/${req.params.id}/editar`);
  }
}

async function excluir(req, res) {
  try {
    await produtoService.excluirProduto(req.params.id);
    req.flash('sucesso', 'Produto desativado. O histórico de movimentações foi mantido.');
    res.redirect('/produtos');
  } catch (err) {
    req.flash('erro', err.message);
    res.redirect('/produtos');
  }
}

async function reativar(req, res) {
  try {
    await produtoService.reativarProduto(req.params.id);
    req.flash('sucesso', 'Produto reativado com sucesso!');
    res.redirect('/produtos?inativos=1');
  } catch (err) {
    req.flash('erro', err.message);
    res.redirect('/produtos?inativos=1');
  }
}

/** Tela de estoque de um produto: saldo atual + razão de movimentações. */
async function exibirEstoque(req, res) {
  try {
    const produto    = await produtoService.buscarProdutoPorId(req.params.id);
    const movimentos = await produtoService.listarMovimentos(produto.id);

    res.render('produtos/estoque', {
      titulo: `Estoque — ${produto.nome}`,
      produto,
      movimentos,
    });
  } catch (err) {
    req.flash('erro', err.message);
    res.redirect('/produtos');
  }
}

async function movimentar(req, res) {
  try {
    const { movimento, aviso, conta } = await produtoService.movimentarEstoque(
      req.params.id, req.body, req.session.usuario.id
    );

    req.flash(
      'sucesso',
      `${movimento.tipo === produtoService.TIPO_ENTRADA ? 'Entrada' : 'Saída'} de ` +
      `${movimento.quantidade} unidade(s) registrada com sucesso!` +
      (conta ? ` Conta a pagar de R$ ${Number(conta.valor).toFixed(2)} lançada no financeiro.` : '')
    );
    if (aviso) req.flash('aviso', aviso);

    res.redirect(`/produtos/${req.params.id}/estoque`);
  } catch (err) {
    req.flash('erro', err.message);
    res.redirect(`/produtos/${req.params.id}/estoque`);
  }
}

module.exports = {
  listar,
  exibirForm,
  criar,
  exibirEditar,
  atualizar,
  excluir,
  reativar,
  exibirEstoque,
  movimentar,
};
