const financeiroService = require('../services/financeiroService');
const clienteService    = require('../services/clienteService');

/** Formata uma data para o value de <input type="date">, sem converter para UTC. */
function formatarDataInput(data) {
  const d = new Date(data);
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/** Traduz o trecho da URL ('pagar'/'receber') para o tipo usado pelo service. */
function tipoDaRota(valor) {
  const mapa = {
    pagar:   financeiroService.TIPO_PAGAR,
    receber: financeiroService.TIPO_RECEBER,
  };
  const tipo = mapa[String(valor || '').toLowerCase()];
  if (!tipo) throw Object.assign(new Error('Tipo de conta inválido.'), { status: 404 });
  return tipo;
}

async function painel(req, res) {
  try {
    const situacao = financeiroService.SITUACOES.includes(req.query.situacao)
      ? req.query.situacao
      : '';

    const [resumo, contasPagar, contasReceber] = await Promise.all([
      financeiroService.resumo(),
      financeiroService.listarContas(financeiroService.TIPO_PAGAR,   { situacao }),
      financeiroService.listarContas(financeiroService.TIPO_RECEBER, { situacao }),
    ]);

    res.render('financeiro/painel', {
      titulo: 'Financeiro',
      resumo,
      contasPagar,
      contasReceber,
      situacao,
    });
  } catch (err) {
    req.flash('erro', err.message);
    res.redirect('/dashboard');
  }
}

async function exibirForm(req, res) {
  try {
    const tipo     = tipoDaRota(req.params.tipo);
    const clientes = tipo === financeiroService.TIPO_RECEBER
      ? await clienteService.listarClientes()
      : [];

    res.render('financeiro/form', {
      titulo: tipo === financeiroService.TIPO_PAGAR ? 'Nova Conta a Pagar' : 'Nova Conta a Receber',
      tipo,
      rota:   req.params.tipo,
      conta:  null,
      clientes,
    });
  } catch (err) {
    req.flash('erro', err.message);
    res.redirect('/financeiro');
  }
}

async function criar(req, res) {
  const rota = req.params.tipo;
  try {
    const tipo = tipoDaRota(rota);
    await financeiroService.criarConta(tipo, req.body);

    req.flash('sucesso',
      tipo === financeiroService.TIPO_PAGAR
        ? 'Conta a pagar registrada com sucesso!'
        : 'Conta a receber registrada com sucesso!');
    res.redirect('/financeiro');
  } catch (err) {
    // Igual ao cadastro de produtos: o erro vai direto para a view, porque
    // res.locals.erro já foi resolvido no início desta requisição.
    const tipo = rota === 'pagar' ? financeiroService.TIPO_PAGAR : financeiroService.TIPO_RECEBER;
    const clientes = tipo === financeiroService.TIPO_RECEBER
      ? await clienteService.listarClientes()
      : [];

    res.render('financeiro/form', {
      titulo: tipo === financeiroService.TIPO_PAGAR ? 'Nova Conta a Pagar' : 'Nova Conta a Receber',
      tipo,
      rota,
      conta:  req.body,
      clientes,
      erro:   [err.message],
    });
  }
}

async function exibirEditar(req, res) {
  try {
    const tipo  = tipoDaRota(req.params.tipo);
    const conta = await financeiroService.buscarConta(tipo, req.params.id);
    const clientes = tipo === financeiroService.TIPO_RECEBER
      ? await clienteService.listarClientes()
      : [];

    res.render('financeiro/form', {
      titulo: tipo === financeiroService.TIPO_PAGAR ? 'Editar Conta a Pagar' : 'Editar Conta a Receber',
      tipo,
      rota:   req.params.tipo,
      conta:  { ...conta, vencimento: formatarDataInput(conta.vencimento) },
      clientes,
    });
  } catch (err) {
    req.flash('erro', err.message);
    res.redirect('/financeiro');
  }
}

async function atualizar(req, res) {
  try {
    await financeiroService.editarConta(tipoDaRota(req.params.tipo), req.params.id, req.body);
    req.flash('sucesso', 'Conta atualizada com sucesso!');
    res.redirect('/financeiro');
  } catch (err) {
    req.flash('erro', err.message);
    res.redirect(`/financeiro/${req.params.tipo}/${req.params.id}/editar`);
  }
}

async function quitar(req, res) {
  try {
    await financeiroService.quitarConta(
      tipoDaRota(req.params.tipo), req.params.id, req.session.usuario.id
    );
    req.flash('sucesso', 'Conta quitada com sucesso!');
  } catch (err) {
    req.flash('erro', err.message);
  }
  res.redirect('/financeiro');
}

async function cancelar(req, res) {
  try {
    await financeiroService.cancelarConta(tipoDaRota(req.params.tipo), req.params.id);
    req.flash('sucesso', 'Conta cancelada.');
  } catch (err) {
    req.flash('erro', err.message);
  }
  res.redirect('/financeiro');
}

module.exports = { painel, exibirForm, criar, exibirEditar, atualizar, quitar, cancelar };
