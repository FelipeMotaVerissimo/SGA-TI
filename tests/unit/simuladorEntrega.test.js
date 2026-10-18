jest.mock('../../src/config/database', () => ({}));

const sim     = require('../../scripts/simular-entrega');
const gerador = require('../../scripts/gerar-trajeto');

/**
 * Módulo 6 — simulador de entrega (scripts/simular-entrega.js) e gerador do
 * trajeto (scripts/gerar-trajeto.js). O banco aqui é um dublê passado ao
 * simulador; o fluxo com banco de verdade está em
 * tests/integration/simulador.test.js. O OSRM não é chamado: o gerador só é
 * testado nas funções que não usam rede.
 */

describe('argumentos do simulador', () => {
  test('padrões: 10 s como o celular, 30 s de pausa, trajeto de Dourados', () => {
    expect(sim.lerArgumentos([])).toEqual({
      intervalo: 10, pausa: 30, trajeto: sim.TRAJETO_PADRAO, repetir: false, confirmar: false,
    });
  });

  test('lê os valores informados', () => {
    const a = sim.lerArgumentos(['--intervalo', '3', '--pausa', '0', '--repetir', '--confirmar']);
    expect(a).toMatchObject({ intervalo: 3, pausa: 0, repetir: true, confirmar: true });
  });

  test.each([['0'], ['-1'], ['abc'], [undefined]])('intervalo %p é recusado', (v) => {
    const argv = v === undefined ? ['--intervalo'] : ['--intervalo', v];
    expect(() => sim.lerArgumentos(argv)).toThrow(/--intervalo/);
  });

  test('argumento desconhecido é recusado', () => {
    expect(() => sim.lerArgumentos(['--rapido'])).toThrow(/desconhecido/);
  });
});

describe('trava de produção', () => {
  test('em produção, sem --confirmar, recusa', () => {
    expect(() => sim.verificarAmbiente({ NODE_ENV: 'production' }, { confirmar: false })).toThrow(/--confirmar/);
  });

  test('em produção, com --confirmar, roda', () => {
    expect(() => sim.verificarAmbiente({ NODE_ENV: 'production' }, { confirmar: true })).not.toThrow();
  });

  test('fora de produção roda sem confirmação', () => {
    expect(() => sim.verificarAmbiente({ NODE_ENV: 'development' }, { confirmar: false })).not.toThrow();
    expect(() => sim.verificarAmbiente({}, { confirmar: false })).not.toThrow();
  });
});

describe('validação do trajeto', () => {
  test.each([[undefined], [{}], [{ pontos: [] }], [{ pontos: [{ lat: -22, lng: -54 }] }]])(
    'trajeto %p sem 2 pontos é recusado', (dados) => {
      expect(() => sim.validarTrajeto(dados)).toThrow(/pelo menos 2 pontos/);
    });

  test('coordenada inválida aponta o ponto, com a regra da posição (RN20)', () => {
    expect(() => sim.validarTrajeto({ pontos: [{ lat: -22, lng: -54 }, { lat: 95, lng: -54 }] }))
      .toThrow(/Ponto 2 do trajeto: Latitude inválida/);
  });

  test('mantém a marcação das paradas', () => {
    const p = sim.validarTrajeto({ pontos: [{ lat: '-22.1', lng: '-54.1' }, { lat: -22.2, lng: -54.2, parada: 1 }] });
    expect(p).toEqual([{ lat: -22.1, lng: -54.1, parada: null }, { lat: -22.2, lng: -54.2, parada: 1 }]);
  });
});

describe('trajeto de demonstração (scripts/trajetos/dourados-demo.json)', () => {
  const pontos = sim.carregarTrajeto(sim.TRAJETO_PADRAO);

  test('é válido e fica dentro de Dourados', () => {
    expect(pontos.length).toBeGreaterThan(20);
    for (const p of pontos) {
      expect(p.lat).toBeGreaterThan(-22.30);
      expect(p.lat).toBeLessThan(-22.15);
      expect(p.lng).toBeGreaterThan(-54.90);
      expect(p.lng).toBeLessThan(-54.70);
    }
  });

  test('pontos a no máximo ~70 m um do outro, sem saltos', () => {
    for (let i = 1; i < pontos.length; i++) {
      expect(gerador.distanciaMetros(pontos[i - 1], pontos[i])).toBeLessThanOrEqual(71);
    }
  });

  test('duas paradas, em ordem, e o trajeto termina na última', () => {
    expect(pontos.filter((p) => p.parada).map((p) => p.parada)).toEqual([1, 2]);
    expect(pontos[pontos.length - 1].parada).toBe(2);
  });
});

describe('gerador do trajeto', () => {
  test('distância de 1 grau de latitude ≈ 111 km', () => {
    expect(gerador.distanciaMetros({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111195, -1);
  });

  test('reamostra uma reta de ~1 km a cada 70 m, mantendo início e fim', () => {
    const linha = [{ lat: -22.2, lng: -54.8 }, { lat: -22.209, lng: -54.8 }]; // ~1001 m
    const r = gerador.reamostrar(linha, 70);
    expect(r[0]).toEqual({ lat: -22.2, lng: -54.8 });
    expect(r[r.length - 1]).toEqual({ lat: -22.209, lng: -54.8 });
    expect(r).toHaveLength(16); // 14 passos de 70 m + o resto + o início
    for (let i = 1; i < r.length; i++) expect(gerador.distanciaMetros(r[i - 1], r[i])).toBeLessThanOrEqual(70.5);
  });

  test('exige partida e ao menos uma parada', () => {
    expect(() => gerador.lerArgumentos(['--parada', '-22,-54'])).toThrow(/--partida/);
    expect(() => gerador.lerArgumentos(['--partida', '-22,-54'])).toThrow(/--parada/);
    expect(() => gerador.lerArgumentos(['--partida', 'centro', '--parada', '-22,-54'])).toThrow(/LAT,LNG/);
  });
});

describe('simular (com banco dublê)', () => {
  const PONTOS = [
    { lat: -22.1, lng: -54.1, parada: null },
    { lat: -22.2, lng: -54.2, parada: 1 },
    { lat: -22.3, lng: -54.3, parada: null },
  ];

  /** Dublê: a saída fica em rota durante `emRotaPor` consultas de status. */
  function bancoDuble({ semSaida = false, emRotaPor = Infinity, outraPosicaoDesde = null } = {}) {
    let consultas = 0;
    let id = 0;
    const criadas = [];
    return {
      criadas,
      saidaEntrega: {
        findUnique: jest.fn(async ({ where }) => {
          if (where.emRota) return semSaida ? null : { id: 5, entregador: { nome: 'Zé' } };
          consultas++;
          return { status: consultas <= emRotaPor ? 'EM_ROTA' : 'CANCELADA' };
        }),
      },
      posicaoEntrega: {
        // A partir do passo `outraPosicaoDesde`, outra fonte grava sempre por último.
        findFirst: jest.fn(async () => ({
          id: outraPosicaoDesde !== null && criadas.length >= outraPosicaoDesde ? 900 + criadas.length : id,
        })),
        create: jest.fn(async ({ data }) => { criadas.push(data); id++; return { id }; }),
      },
    };
  }

  const rodar = (prisma, extra = {}) => {
    const dormir = jest.fn(async () => {});
    const log = jest.fn();
    return { dormir, log, r: sim.simular({ prisma, pontos: PONTOS, intervalo: 2, pausa: 7, dormir, log, ...extra }) };
  };

  test('grava os pontos em ordem na saída em rota, sem precisão', async () => {
    const prisma = bancoDuble();
    const { r } = rodar(prisma);
    expect(await r).toEqual({ gravadas: 3, motivo: 'fim-do-trajeto' });
    expect(prisma.criadas).toEqual([
      { saidaId: 5, lat: -22.1, lng: -54.1, precisao: null },
      { saidaId: 5, lat: -22.2, lng: -54.2, precisao: null },
      { saidaId: 5, lat: -22.3, lng: -54.3, precisao: null },
    ]);
  });

  test('espera o intervalo entre os pontos e a pausa na parada', async () => {
    const { dormir, r } = rodar(bancoDuble());
    await r;
    expect(dormir.mock.calls.map((c) => c[0])).toEqual([2000, 7000, 2000]);
  });

  test('sem saída em rota, explica e não grava nada', async () => {
    const prisma = bancoDuble({ semSaida: true });
    await expect(rodar(prisma).r).rejects.toThrow(/Inicie a saída na tela do entregador/);
    expect(prisma.posicaoEntrega.create).not.toHaveBeenCalled();
  });

  test('para quando a saída deixa de estar em rota', async () => {
    const prisma = bancoDuble({ emRotaPor: 2 });
    expect(await rodar(prisma).r).toEqual({ gravadas: 2, motivo: 'saida-fora-de-rota' });
  });

  test('com repetir, recomeça o trajeto até a saída sair de rota', async () => {
    const prisma = bancoDuble({ emRotaPor: 7 });
    expect(await rodar(prisma, { repetir: true }).r).toEqual({ gravadas: 7, motivo: 'saida-fora-de-rota' });
    expect(prisma.criadas[3]).toEqual(prisma.criadas[0]);
  });

  test('avisa uma vez se outra fonte gravar posição na mesma saída', async () => {
    const prisma = bancoDuble({ outraPosicaoDesde: 1 });
    const { log, r } = rodar(prisma);
    await r;
    const avisos = log.mock.calls.filter((c) => /outra posição/.test(c[0]));
    expect(avisos).toHaveLength(1);
  });

  test('sem outra fonte, não avisa', async () => {
    const { log, r } = rodar(bancoDuble());
    await r;
    expect(log.mock.calls.some((c) => /outra posição/.test(c[0]))).toBe(false);
  });
});
