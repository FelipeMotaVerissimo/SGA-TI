/**
 * SGA TI — Massa de dados de demonstração para o preview.
 *
 * Cobre propositalmente TODOS os status de OS, para exercitar as regras
 * do Módulo 3 (parte 2) e as situações de garantia.
 */

const bcrypt = require('bcrypt');

const dias = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
};

module.exports = async function semear(prisma) {
  // ---------- Perfis ----------
  const nomesPerfis = ['ADMINISTRADOR', 'ATENDENTE', 'TECNICO', 'VENDEDOR', 'FINANCEIRO', 'COMPRAS'];
  for (const nomePerfil of nomesPerfis) {
    await prisma.perfil.create({ data: { nomePerfil } });
  }
  const admin = await prisma.perfil.findFirst({ where: { nomePerfil: 'ADMINISTRADOR' } });
  const tecnico = await prisma.perfil.findFirst({ where: { nomePerfil: 'TECNICO' } });

  // ---------- Usuários ----------
  const senha = await bcrypt.hash('admin123', 10);
  const usuario = await prisma.usuario.create({
    data: { nome: 'Administrador', login: 'admin', senha, perfilId: admin.id },
  });
  await prisma.usuario.create({
    data: { nome: 'Endrik Perin', login: 'endrik', senha, perfilId: tecnico.id },
  });

  // ---------- Clientes ----------
  const c1 = await prisma.cliente.create({
    data: {
      nome: 'Marcos Almeida', cpfCnpj: '123.456.789-00', telefone: '(51) 3232-1010',
      celular: '(51) 99888-1010', email: 'marcos@email.com',
      endereco: 'Rua das Flores', numero: '120', cidade: 'Porto Alegre', estado: 'RS', cep: '90000-000',
    },
  });
  const c2 = await prisma.cliente.create({
    data: {
      nome: 'Padaria Pão Quente LTDA', cpfCnpj: '12.345.678/0001-99',
      telefone: '(51) 3344-5566', email: 'contato@paoquente.com.br',
      endereco: 'Av. Brasil', numero: '900', cidade: 'Canoas', estado: 'RS', cep: '92000-000',
    },
  });

  // ---------- Equipamentos ----------
  const e1 = await prisma.equipamento.create({
    data: { codigo: 'EQ-0001', marca: 'Dell', modelo: 'Inspiron 15', numeroSerie: 'DL2024X1',
            defeito: 'Não liga', clienteId: c1.id },
  });
  const e2 = await prisma.equipamento.create({
    data: { codigo: 'EQ-0002', marca: 'HP', modelo: 'LaserJet Pro', numeroSerie: 'HP998877',
            defeito: 'Puxa duas folhas por vez', clienteId: c2.id },
  });
  const e3 = await prisma.equipamento.create({
    data: { codigo: 'EQ-0003', marca: 'Lenovo', modelo: 'ThinkPad T480', numeroSerie: 'LN553311',
            defeito: 'Tela piscando', clienteId: c1.id },
  });
  const e4 = await prisma.equipamento.create({
    data: { codigo: 'EQ-0004', marca: 'Positivo', modelo: 'Master D460', numeroSerie: 'PS112233',
            defeito: 'Superaquecimento', clienteId: c2.id },
  });

  // ---------- Produtos ----------
  const p1 = await prisma.produto.create({
    data: { nome: 'Memória DDR4 8GB', preco: 189.9, estoque: 12 } });
  const p2 = await prisma.produto.create({
    data: { nome: 'Pasta térmica', preco: 24.5, estoque: 40 } });

  // ---------- Ordens de Serviço (uma por status) ----------
  const base = (numero, equipamentoId, defeito, extra = {}) => ({
    numero, equipamentoId, usuarioId: usuario.id, defeitoRelatado: defeito, ...extra,
  });

  // INICIAL — não permite registrar serviço
  await prisma.ordemServico.create({
    data: base('OS-2026-000101', e3.id, 'Tela piscando ao mover a tampa', {
      status: 'INICIAL', dataAbertura: dias(-2),
    }),
  });

  // ORCAMENTO — aguardando aprovação
  await prisma.ordemServico.create({
    data: base('OS-2026-000102', e4.id, 'Desliga sozinho depois de 10 minutos', {
      status: 'ORCAMENTO', valorOrcamento: 320.0, previsaoEntrega: dias(7), dataAbertura: dias(-5),
    }),
  });

  // AUTORIZADO — permite registrar serviço (e deve virar EM_ANDAMENTO)
  await prisma.ordemServico.create({
    data: base('OS-2026-000103', e2.id, 'Puxa duas folhas por vez', {
      status: 'AUTORIZADO', valorOrcamento: 450.0, dataAprovacao: dias(-3),
      previsaoEntrega: dias(4), dataAbertura: dias(-8),
    }),
  });

  // EM_ANDAMENTO — com serviços já registrados cobrindo as 3 situações de garantia
  const osAndamento = await prisma.ordemServico.create({
    data: base('OS-2026-000104', e1.id, 'Não liga, sem sinal de vídeo', {
      status: 'EM_ANDAMENTO', valorOrcamento: 890.0, dataAprovacao: dias(-20),
      previsaoEntrega: dias(2), dataAbertura: dias(-25),
    }),
  });

  await prisma.servicoExecutado.create({
    data: {
      ordemId: osAndamento.id,
      descricao: 'Substituição da placa-mãe e teste de bancada',
      observacoes: 'Peça original, nota fiscal anexada ao processo',
      garantiaDias: 90,
      executadoEm: dias(-15),
    },
  });
  await prisma.servicoExecutado.create({
    data: {
      ordemId: osAndamento.id,
      descricao: 'Limpeza interna e troca de pasta térmica',
      observacoes: null,
      garantiaDias: null, // sem garantia
      executadoEm: dias(-14),
    },
  });
  await prisma.servicoExecutado.create({
    data: {
      ordemId: osAndamento.id,
      descricao: 'Troca da bateria CMOS',
      observacoes: 'Garantia curta, peça de consumo',
      garantiaDias: 7,
      executadoEm: dias(-21), // garantia já vencida
    },
  });

  await prisma.itemOrdem.create({
    data: { ordemId: osAndamento.id, produtoId: p1.id, quantidade: 1, valorUnit: 189.9 },
  });
  await prisma.itemOrdem.create({
    data: { ordemId: osAndamento.id, produtoId: p2.id, quantidade: 2, valorUnit: 24.5 },
  });

  // FINALIZADO — bloqueia registro e exclusão
  const osFinal = await prisma.ordemServico.create({
    data: base('OS-2026-000105', e3.id, 'Troca do cabo flat da tela', {
      status: 'FINALIZADO', valorOrcamento: 260.0, dataAprovacao: dias(-40),
      dataAbertura: dias(-45), dataFechamento: dias(-30),
    }),
  });
  await prisma.servicoExecutado.create({
    data: {
      ordemId: osFinal.id,
      descricao: 'Troca do cabo flat e recalibração da tela',
      observacoes: 'Cliente retirou o equipamento',
      garantiaDias: 180,
      executadoEm: dias(-31),
    },
  });

  // CANCELADO — orçamento rejeitado
  await prisma.ordemServico.create({
    data: base('OS-2026-000106', e4.id, 'Fonte queimada', {
      status: 'CANCELADO', valorOrcamento: 610.0, dataAbertura: dias(-12),
    }),
  });

  return prisma;
};
