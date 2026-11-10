require('../helpers/ambiente'); // precisa vir antes de src/app

const fs      = require('fs');
const path    = require('path');
const request = require('supertest');
const app     = require('../../src/app');
const { semear, logar, prisma, SENHA } = require('../helpers/fixture');

/**
 * Desbloqueio de OS concluída com senha (botão "Desbloquear com Senha").
 *
 * Defeito de 25/10/2026: o script public/js/os-desbloqueio.js foi reescrito
 * procurando elementos que a tela não tem e lendo `data.valida`, enquanto o
 * servidor responde `sucesso`. O botão não fazia nada e não aparecia erro.
 * O supertest não executa JavaScript, então o teste confere o contrato entre
 * as três partes: os ids que o script usa, a tela e a resposta do servidor.
 */

const SCRIPT = fs.readFileSync(path.join(__dirname, '../../public/js/os-desbloqueio.js'), 'utf8');
const idsDoScript = [...SCRIPT.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1]);

let dados;
beforeEach(async () => { dados = await semear(); });
afterAll(async () => { await prisma.$disconnect(); });

describe('a tela de OS concluída tem o que o script procura', () => {
  test('a premissa: o script procura elementos por id', () => {
    expect(idsDoScript.length).toBeGreaterThanOrEqual(6);
  });

  test('cada id usado pelo script existe na página', async () => {
    const res = await (await logar(request, app, 'admin')).get(`/ordens/${dados.ordens.finalizado.id}`);
    expect(res.status).toBe(200);
    const faltando = idsDoScript.filter((id) => !res.text.includes(`id="${id}"`));
    expect(faltando).toEqual([]);
  });

  test('a página carrega o script', async () => {
    const res = await (await logar(request, app, 'admin')).get(`/ordens/${dados.ordens.finalizado.id}`);
    expect(res.text).toContain('src="/js/os-desbloqueio.js"');
  });

  test('OS que não está concluída não mostra o botão', async () => {
    const res = await (await logar(request, app, 'admin')).get(`/ordens/${dados.ordens.andamento.id}`);
    expect(res.text).not.toContain('id="btn-abrir-desbloqueio"');
  });
});

describe('validação da senha (POST /auth/validar-senha-atual)', () => {
  const validar = async (senha) => (await logar(request, app, 'admin'))
    .post('/auth/validar-senha-atual').send(senha === undefined ? {} : { senha });

  test('senha certa: 200 com sucesso, o campo que o script lê', async () => {
    const r = await validar(SENHA);
    expect(r.status).toBe(200);
    expect(r.body.sucesso).toBe(true);
    expect(SCRIPT).toMatch(/data\.sucesso/);
  });

  test('senha errada: 403 com mensagem, sem sucesso', async () => {
    const r = await validar('senha-errada');
    expect(r.status).toBe(403);
    expect(r.body.sucesso).toBe(false);
    expect(r.body.mensagem).toBe('Senha incorreta.');
  });

  test('sem senha: 400', async () => {
    const r = await validar(undefined);
    expect(r.status).toBe(400);
    expect(r.body.sucesso).toBe(false);
  });

  test('sem sessão, a validação não acontece', async () => {
    const r = await request(app).post('/auth/validar-senha-atual').send({ senha: SENHA });
    expect(r.body.sucesso).not.toBe(true);
  });
});

test('o script não usa innerHTML', () => {
  expect(SCRIPT).not.toMatch(/\.innerHTML\s*=/);
});
