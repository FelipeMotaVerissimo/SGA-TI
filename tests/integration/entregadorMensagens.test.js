require('../helpers/ambiente'); // precisa vir antes de src/app

const request        = require('supertest');
const app            = require('../../src/app');
const entregaService = require('../../src/services/entregaService');
const { semear, logar, prisma } = require('../helpers/fixture');

/**
 * Defeitos achados pela matriz de acesso (bateria da 6ª Etapa, 13/11/2026).
 *
 * O ENTREGADOR não tem dashboard: /dashboard o manda para /entregas/saida.
 *  1. A mensagem "Acesso negado" era lida no /dashboard e se perdia no
 *     redirect — o entregador era barrado sem explicação.
 *  2. Se a tela da saída falhava, ela mandava para /dashboard, que mandava de
 *     volta para a saída: redirect sem fim enquanto o erro persistisse.
 */

let dados;

beforeAll(async () => { dados = await semear(); });
afterEach(() => jest.restoreAllMocks());
afterAll(async () => { await prisma.$disconnect(); });

/** Segue os redirects (até 5) e devolve a última resposta e o caminho feito. */
async function seguir(agente, resposta) {
  const caminho = [];
  let r = resposta;
  while (r.headers.location && caminho.length < 5) {
    caminho.push(r.headers.location);
    r = await agente.get(r.headers.location);
  }
  return { r, caminho };
}

describe('entregador barrado vê a mensagem', () => {
  test.each(['/clientes', '/financeiro', '/relatorios'])(
    'abrir %s leva à tela de entregas com "Acesso negado"',
    async (rota) => {
      const agente = await logar(request, app, 'entregador');

      const { r, caminho } = await seguir(agente, await agente.get(rota));

      expect(caminho).toEqual(['/dashboard', '/entregas/saida']);
      expect(r.status).toBe(200);
      expect(r.text).toContain('Acesso negado');
      expect(r.text).toContain('ENTREGADOR');
    }
  );

  test('a mensagem aparece uma vez só (não volta na tela seguinte)', async () => {
    const agente = await logar(request, app, 'entregador');
    await seguir(agente, await agente.get('/clientes'));

    const depois = await agente.get('/entregas/saida');

    expect(depois.text).not.toContain('Acesso negado');
  });

  test('para os outros perfis nada muda: a mensagem aparece no dashboard', async () => {
    const agente = await logar(request, app, 'vendedor');

    const { r, caminho } = await seguir(agente, await agente.get('/financeiro'));

    expect(caminho).toEqual(['/dashboard']);
    expect(r.text).toContain('Acesso negado');
  });
});

describe('falha ao abrir a saída de entrega', () => {
  test('mostra a tela com mensagem amigável, sem redirect em laço', async () => {
    jest.spyOn(entregaService, 'saidaAtiva').mockRejectedValue(new Error('banco fora do ar'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const agente = await logar(request, app, 'entregador');

    const r = await agente.get('/entregas/saida');

    expect(r.headers.location).toBeUndefined();
    expect(r.status).toBe(500);
    expect(r.text).toContain('Não foi possível carregar a saída de entrega');
    expect(r.text).not.toContain('banco fora do ar');   // detalhe interno não vaza
  });
});
