/**
 * SGA TI — Teste end-to-end do Módulo 3 (parte 2) sobre o preview.
 *
 * Sobe o app real com o banco fake, faz login e exercita as regras de negócio
 * via HTTP (mesmas rotas que o navegador usa).
 *
 * Uso:  node sandbox/testeE2E.js
 * Saída: lista de casos OK/FALHA e código de saída 1 se algo falhar.
 */

const path = require('path');

const caminhoReal = require.resolve(path.join(__dirname, '..', 'src', 'config', 'database.js'));
const fake = require('./fakePrisma');
require.cache[caminhoReal] = { id: caminhoReal, filename: caminhoReal, loaded: true, exports: fake };

process.env.SESSION_SECRET = 'preview_sga_ti';
process.env.JWT_SECRET     = 'preview_jwt_sga_ti';
process.env.NODE_ENV       = 'preview';

const semear = require('./seedDemo');
const app    = require('../src/app');

const PORTA = 3999;
let cookie = '';
let falhas = 0;
let total  = 0;

async function req(metodo, caminho, corpo) {
  const opts = { method: metodo, redirect: 'manual', headers: {} };
  if (cookie) opts.headers.Cookie = cookie;
  if (corpo) {
    opts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    opts.body = new URLSearchParams(corpo).toString();
  }
  const r = await fetch(`http://127.0.0.1:${PORTA}${caminho}`, opts);
  const set = r.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  const texto = r.status >= 300 && r.status < 400 ? '' : await r.text();
  return { status: r.status, local: r.headers.get('location'), texto };
}

/** Segue o redirect e devolve o HTML final (onde o flash aparece). */
async function post(caminho, corpo) {
  const r = await req('POST', caminho, corpo);
  if (r.local) return req('GET', r.local);
  return r;
}

function checar(nome, condicao, detalhe = '') {
  total += 1;
  if (condicao) {
    console.log('  OK    ', nome);
  } else {
    falhas += 1;
    console.log('  FALHA ', nome, detalhe ? `\n           -> ${detalhe}` : '');
  }
}

function temTexto(html, trecho) {
  return html.replace(/\s+/g, ' ').includes(trecho);
}

(async () => {
  await semear(fake);
  const servidor = app.listen(PORTA, '127.0.0.1');
  await new Promise((r) => servidor.once('listening', r));

  console.log('\n=== Autenticação ===');
  const login = await req('POST', '/login', { login: 'admin', senha: 'admin123' });
  checar('login admin/admin123 redireciona para /dashboard', login.local === '/dashboard', `local=${login.local}`);

  // ---------------------------------------------------------------
  console.log('\n=== RN01: status que NÃO permitem registrar serviço ===');

  for (const [id, nome] of [[1, 'INICIAL'], [2, 'ORCAMENTO'], [6, 'CANCELADO'], [5, 'FINALIZADO']]) {
    const tela = await req('GET', `/ordens/${id}`);
    checar(`OS ${nome}: formulário de serviço oculto`,
      !temTexto(tela.texto, 'name="descricao"'));

    const r = await post(`/ordens/${id}/servicos`, { descricao: 'Tentativa indevida de registro', garantiaDias: '30' });
    checar(`OS ${nome}: POST bloqueado com mensagem de erro`,
      temTexto(r.texto, 'Não é possível registrar serviços numa OS'));
  }

  // ---------------------------------------------------------------
  console.log('\n=== RN02: AUTORIZADO → registra e muda para EM_ANDAMENTO ===');

  const antes = await req('GET', '/ordens/3');
  checar('OS 3 começa AUTORIZADO', temTexto(antes.texto, 'AUTORIZADO'));
  checar('OS 3 exibe o formulário de serviço', temTexto(antes.texto, 'name="descricao"'));

  const reg = await post('/ordens/3/servicos', {
    descricao: 'Troca do rolete de tração e limpeza do caminho de papel',
    observacoes: 'Peça original HP',
    garantiaDias: '90',
  });
  checar('registro bem-sucedido', temTexto(reg.texto, 'Serviço executado registrado com sucesso'));
  checar('status virou EM ANDAMENTO', temTexto(reg.texto, 'EM ANDAMENTO'));
  checar('serviço aparece na tabela', temTexto(reg.texto, 'Troca do rolete de tração'));
  checar('badge de garantia calculado (90 dias)', temTexto(reg.texto, '90 dia(s)'));

  const os3 = await fake.ordemServico.findUnique({ where: { id: 3 } });
  checar('status persistido no banco = EM_ANDAMENTO', os3.status === 'EM_ANDAMENTO', `status=${os3.status}`);

  // segundo registro não deve alterar o status
  const reg2 = await post('/ordens/3/servicos', { descricao: 'Teste de impressão em lote', garantiaDias: '' });
  checar('segundo registro mantém EM ANDAMENTO', temTexto(reg2.texto, 'EM ANDAMENTO'));
  checar('serviço sem garantia exibe "Sem garantia"', temTexto(reg2.texto, 'Sem garantia'));

  // ---------------------------------------------------------------
  console.log('\n=== RN03/RN04: validações de entrada ===');

  const curta = await post('/ordens/3/servicos', { descricao: 'abc' });
  checar('descrição com 3 caracteres é rejeitada', temTexto(curta.texto, 'pelo menos 5 caracteres'));

  const negativa = await post('/ordens/3/servicos', { descricao: 'Servico valido de teste', garantiaDias: '-5' });
  checar('garantia negativa é rejeitada', temTexto(negativa.texto, 'igual ou maior que zero'));

  const enorme = await post('/ordens/3/servicos', { descricao: 'Servico valido de teste', garantiaDias: '9999' });
  checar('garantia acima de 3650 é rejeitada', temTexto(enorme.texto, 'não pode ultrapassar 3650'));

  const zero = await post('/ordens/3/servicos', { descricao: 'Servico com garantia zero', garantiaDias: '0' });
  checar('garantia 0 vira "sem garantia"', temTexto(zero.texto, 'Servico com garantia zero'));

  // ---------------------------------------------------------------
  console.log('\n=== Situações de garantia na OS 4 ===');

  const os4 = await req('GET', '/ordens/4');
  checar('exibe serviço EM GARANTIA', temTexto(os4.texto, 'Substituição da placa-mãe'));
  checar('exibe garantia VENCIDA', temTexto(os4.texto, 'Vencida'));
  checar('exibe SEM GARANTIA', temTexto(os4.texto, 'Sem garantia'));

  // ---------------------------------------------------------------
  console.log('\n=== RN07/RN08: exclusão ===');

  const servicosOS4 = await fake.servicoExecutado.findMany({ where: { ordemId: 4 } });
  // apaga o serviço SEM garantia, para não interferir no teste da consulta pública
  const alvo = servicosOS4.find((s) => s.garantiaDias === null) || servicosOS4[0];

  const cruzada = await post(`/ordens/3/servicos/${alvo.id}/excluir`, {});
  checar('exclusão cruzada (OS errada) é bloqueada',
    temTexto(cruzada.texto, 'não pertence à ordem de serviço informada'));

  const okExcluir = await post(`/ordens/4/servicos/${alvo.id}/excluir`, {});
  checar('exclusão válida funciona', temTexto(okExcluir.texto, 'Serviço executado removido'));

  const restou = await fake.servicoExecutado.findUnique({ where: { id: alvo.id } });
  checar('serviço realmente sumiu do banco', restou === null);

  const servicosOS5 = await fake.servicoExecutado.findMany({ where: { ordemId: 5 } });
  const bloqueado = await post(`/ordens/5/servicos/${servicosOS5[0].id}/excluir`, {});
  checar('exclusão em OS FINALIZADO é bloqueada',
    temTexto(bloqueado.texto, 'Não é possível excluir serviços de uma OS'));

  // ---------------------------------------------------------------
  console.log('\n=== Consulta pública ===');

  const publica = await req('POST', '/consulta', { numero: 'OS-2026-000104' });
  checar('consulta pública responde 200', publica.status === 200, `status=${publica.status}`);
  checar('cliente vê os serviços executados', temTexto(publica.texto, 'Serviços Executados'));
  checar('cliente vê a situação da garantia', temTexto(publica.texto, 'Em garantia até'));

  const inexistente = await req('POST', '/consulta', { numero: 'OS-9999-999999' });
  checar('OS inexistente não quebra a tela', temTexto(inexistente.texto, 'não encontrada'));

  // ---------------------------------------------------------------
  console.log('\n=== Regressão (Módulos 1 e 2 do Felipe) ===');

  const dash = await req('GET', '/dashboard');
  checar('dashboard carrega', dash.status === 200);

  const lista = await req('GET', '/ordens');
  checar('listagem de OS carrega', lista.status === 200);

  const clientes = await req('GET', '/clientes');
  checar('listagem de clientes carrega', clientes.status === 200);

  const os2 = await req('GET', '/ordens/2');
  checar('OS em ORCAMENTO ainda mostra aprovar/rejeitar', temTexto(os2.texto, 'Aprovar Orçamento'));

  const statusManual = await post('/ordens/1/status', { status: 'ORCAMENTO' });
  checar('atualização manual de status continua funcionando',
    temTexto(statusManual.texto, 'Status atualizado com sucesso'));

  const produtos = await req('GET', '/ordens/4');
  checar('bloco de produtos utilizados continua renderizando',
    temTexto(produtos.texto, 'Produtos Utilizados') && temTexto(produtos.texto, 'Memória DDR4 8GB'));

  // ---------------------------------------------------------------
  servidor.close();
  console.log(`\n${'='.repeat(50)}`);
  console.log(falhas === 0
    ? `TODOS OS ${total} CASOS PASSARAM`
    : `${falhas} de ${total} casos FALHARAM`);
  console.log('='.repeat(50));
  process.exit(falhas === 0 ? 0 : 1);
})().catch((e) => {
  console.error('Erro fatal no E2E:', e);
  process.exit(1);
});
