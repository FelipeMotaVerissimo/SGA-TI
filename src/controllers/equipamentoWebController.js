const equipamentoService = require('../services/equipamentoService');
const clienteService     = require('../services/clienteService');
const { temPermissao }   = require('../middlewares/perfilMiddleware');
const prisma             = require('../config/database');

async function listar(req, res) {
  try {
    const incluirInativos = req.query.inativos === '1';
    const equipamentos = await equipamentoService.listarEquipamentos({ incluirInativos });
    res.render('equipamentos/listar', { titulo: 'Equipamentos', equipamentos, incluirInativos });
  } catch (err) {
    req.flash('erro', err.message);
    res.redirect('/dashboard');
  }
}

async function exibirForm(req, res) {
  try {
    const clientes = await clienteService.listarClientes();
    const clienteId = req.query.clienteId || null;
    res.render('equipamentos/form', { titulo: 'Novo Equipamento', equipamento: null, clientes, clienteId });
  } catch (err) {
    req.flash('erro', err.message);
    res.redirect('/equipamentos');
  }
}

async function criar(req, res) {
  try {
    await equipamentoService.criarEquipamento(req.body);
    req.flash('sucesso', 'Equipamento cadastrado com sucesso!');
    res.redirect('/equipamentos');
  } catch (err) {
    const clientes = await clienteService.listarClientes();
    res.render('equipamentos/form', {
      titulo: 'Novo Equipamento',
      equipamento: req.body,
      clientes,
      clienteId: req.body.clienteId,
      erro: [err.message],
    });
  }
}

async function exibirEditar(req, res) {
  try {
    const equipamento = await equipamentoService.buscarEquipamentoPorId(req.params.id);
    const clientes    = await clienteService.listarClientes();
    res.render('equipamentos/form', { titulo: 'Editar Equipamento', equipamento, clientes, clienteId: equipamento.clienteId });
  } catch (err) {
    req.flash('erro', err.message);
    res.redirect('/equipamentos');
  }
}

async function atualizar(req, res) {
  try {
    await equipamentoService.atualizarEquipamento(req.params.id, req.body);
    req.flash('sucesso', 'Equipamento atualizado com sucesso!');
    res.redirect('/equipamentos');
  } catch (err) {
    req.flash('erro', err.message);
    res.redirect(`/equipamentos/${req.params.id}/editar`);
  }
}

/**
 * RF012 — histórico de serviços do equipamento.
 */
async function exibirHistorico(req, res) {
  try {
    const historico = await equipamentoService.historicoDeServicos(req.params.id);
    res.render('equipamentos/historico', {
      titulo: `Histórico — ${historico.equipamento.codigo}`,
      ...historico,
    });
  } catch (err) {
    req.flash('erro', err.message);
    const podeVerLista = temPermissao(req.session && req.session.usuario, ['ATENDENTE']);
    res.redirect(podeVerLista ? '/equipamentos' : '/dashboard');
  }
}

/** NF008 — exclusão lógica. */
async function excluir(req, res) {
  try {
    await equipamentoService.excluirEquipamento(req.params.id);
    req.flash('sucesso', 'Equipamento desativado. O histórico de OS foi preservado.');
  } catch (err) {
    req.flash('erro', err.message);
  }
  res.redirect('/equipamentos');
}

async function reativar(req, res) {
  try {
    await equipamentoService.reativarEquipamento(req.params.id);
    req.flash('sucesso', 'Equipamento reativado.');
  } catch (err) {
    req.flash('erro', err.message);
  }
  res.redirect('/equipamentos?inativos=1');
}

/** Registo rápido de equipamento via Modal (retorna JSON para a view de criação de OS) */
async function criarRapido(req, res) {
  try {
    const { clienteId, tipo, marca, modelo, numeroSerie, condicoesEntrada, acessorios } = req.body;

    if (!clienteId) {
      return res.status(400).json({ sucesso: false, mensagem: 'Selecione um cliente primeiro.' });
    }

    if (!marca || !modelo) {
      return res.status(400).json({ sucesso: false, mensagem: 'Marca e modelo são obrigatórios.' });
    }

    // Gera um código único identificador para o equipamento (ex: EQ-3421AB)
    const codigo = 'EQ-' + Date.now().toString().slice(-4) + Math.random().toString(36).substring(2, 4).toUpperCase();

    // Normaliza o tipo para o formato aceito pelo Enum do Prisma (ex: "Impressora" -> "IMPRESSORA")
    const tipoEnum = tipo ? tipo.trim().toUpperCase() : 'OUTRO';

    // O campo defeito é obrigatório no modelo Equipamento do Prisma
    const defeitoRelatado = condicoesEntrada && condicoesEntrada.trim() 
      ? condicoesEntrada.trim() 
      : 'Defeito a diagnosticar na OS';

    const novoEquipamento = await prisma.equipamento.create({
      data: {
        clienteId: parseInt(clienteId, 10),
        codigo: codigo,
        tipo: tipoEnum,
        marca: marca.trim(),
        modelo: modelo.trim(),
        numeroSerie: (numeroSerie && numeroSerie.trim()) ? numeroSerie.trim() : null,
        defeito: defeitoRelatado
      }
    });

    return res.status(201).json({ 
      sucesso: true, 
      equipamento: novoEquipamento,
      detalhesExtras: {
        condicoesEntrada: condicoesEntrada ? condicoesEntrada.trim() : '',
        acessorios: acessorios ? acessorios.trim() : ''
      }
    });
  } catch (err) {
    console.error('Erro em criarRapido (equipamento):', err);
    return res.status(400).json({ 
      sucesso: false, 
      mensagem: err.message || 'Erro ao cadastrar equipamento.' 
    });
  }
}

module.exports = {
  listar,
  exibirForm,
  criar,
  exibirEditar,
  atualizar,
  exibirHistorico,
  excluir,
  reativar,
  criarRapido
};