const produtoService = require('../services/produtoService');

/**
 * API REST de produtos e estoque (Módulo 4).
 *
 * Mesmo padrão dos controllers de API do Felipe: delega ao service e deixa o
 * `errorHandler` traduzir o `status` que o service anexou ao erro.
 */

async function listar(req, res, next) {
  try {
    res.json(await produtoService.listarProdutos({
      incluirInativos: req.query.inativos === '1',
      busca:           req.query.busca,
    }));
  } catch (err) { next(err); }
}

async function buscar(req, res, next) {
  try { res.json(await produtoService.buscarProdutoPorId(req.params.id)); }
  catch (err) { next(err); }
}

async function criar(req, res, next) {
  try { res.status(201).json(await produtoService.criarProduto(req.body)); }
  catch (err) { next(err); }
}

async function atualizar(req, res, next) {
  try { res.json(await produtoService.atualizarProduto(req.params.id, req.body)); }
  catch (err) { next(err); }
}

async function excluir(req, res, next) {
  try { await produtoService.excluirProduto(req.params.id); res.status(204).send(); }
  catch (err) { next(err); }
}

async function reativar(req, res, next) {
  try { res.json(await produtoService.reativarProduto(req.params.id)); }
  catch (err) { next(err); }
}

async function listarMovimentos(req, res, next) {
  try { res.json(await produtoService.listarMovimentos(req.params.id)); }
  catch (err) { next(err); }
}

/**
 * Registra entrada ou saída. O aviso de saldo negativo vai no corpo da
 * resposta — quem consome a API precisa saber, mas não é erro (decisão D1).
 */
async function movimentar(req, res, next) {
  try {
    const { movimento, produto, aviso, conta } = await produtoService.movimentarEstoque(
      req.params.id, req.body, req.usuario && req.usuario.id
    );
    res.status(201).json({ movimento, produto, aviso: aviso || null, conta: conta || null });
  } catch (err) { next(err); }
}

module.exports = {
  listar,
  buscar,
  criar,
  atualizar,
  excluir,
  reativar,
  listarMovimentos,
  movimentar,
};
