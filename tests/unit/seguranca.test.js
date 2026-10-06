/**
 * NF007 — segurança na comunicação.
 *
 * Todas as proteções que exigem TLS são condicionais a `NODE_ENV=production`.
 * O que importa provar é justamente a condição: **ligado em produção, desligado
 * em desenvolvimento** — porque ligar sem querer em desenvolvimento quebra o
 * ambiente local, que é a regra explícita deste requisito.
 */

const AMBIENTE_ORIGINAL = process.env.NODE_ENV;
const CORS_ORIGINAL     = process.env.CORS_ORIGINS;

/** Recarrega o módulo com o ambiente desejado — ele lê process.env na chamada. */
function comAmbiente(valor, fn) {
  process.env.NODE_ENV = valor;
  jest.resetModules();
  const seguranca = require('../../src/config/seguranca');
  try { return fn(seguranca); } finally { process.env.NODE_ENV = AMBIENTE_ORIGINAL; }
}

afterEach(() => {
  process.env.NODE_ENV = AMBIENTE_ORIGINAL;
  if (CORS_ORIGINAL === undefined) delete process.env.CORS_ORIGINS;
  else process.env.CORS_ORIGINS = CORS_ORIGINAL;
});

describe('cookie de sessão', () => {
  test('em produção o cookie é secure', () => {
    comAmbiente('production', (s) => {
      expect(s.opcoesCookieSessao().secure).toBe(true);
    });
  });

  test('em desenvolvimento NÃO é secure — senão nenhuma sessão funcionaria em http', () => {
    comAmbiente('development', (s) => {
      expect(s.opcoesCookieSessao().secure).toBe(false);
    });
  });

  test('httpOnly e sameSite valem nos dois ambientes', () => {
    for (const ambiente of ['production', 'development']) {
      comAmbiente(ambiente, (s) => {
        const c = s.opcoesCookieSessao();
        expect(c.httpOnly).toBe(true);
        expect(c.sameSite).toBe('lax');
      });
    }
  });

  test('a sessão continua expirando em 8 horas', () => {
    comAmbiente('development', (s) => {
      expect(s.opcoesCookieSessao().maxAge).toBe(8 * 60 * 60 * 1000);
    });
  });
});

describe('helmet', () => {
  test('HSTS ligado em produção', () => {
    comAmbiente('production', (s) => {
      const hsts = s.opcoesHelmet().hsts;
      expect(hsts).toMatchObject({ includeSubDomains: true });
      expect(hsts.maxAge).toBeGreaterThan(0);
    });
  });

  test('HSTS DESLIGADO em desenvolvimento', () => {
    // Se o cabeçalho pegar em localhost, o navegador passa a exigir HTTPS ali
    // e derruba o ambiente — inclusive de outros projetos na mesma máquina.
    comAmbiente('development', (s) => {
      expect(s.opcoesHelmet().hsts).toBe(false);
    });
  });

  test('CSP está ligado — era contentSecurityPolicy: false antes', () => {
    comAmbiente('development', (s) => {
      expect(s.opcoesHelmet().contentSecurityPolicy).toBeTruthy();
      expect(s.opcoesHelmet().contentSecurityPolicy.directives).toBeDefined();
    });
  });

  test('upgrade-insecure-requests só existe em produção', () => {
    comAmbiente('production', (s) => {
      expect(s.diretivasDoAmbiente()).toHaveProperty('upgradeInsecureRequests');
    });
    comAmbiente('development', (s) => {
      expect(s.diretivasDoAmbiente()).not.toHaveProperty('upgradeInsecureRequests');
    });
  });

  test('useDefaults: false — o cabeçalho é exatamente a lista declarada', () => {
    comAmbiente('development', (s) => {
      expect(s.opcoesHelmet().contentSecurityPolicy.useDefaults).toBe(false);
    });
  });

  test('o CSP bloqueia origem externa e embutir em iframe', () => {
    const d = require('../../src/config/seguranca').DIRETIVAS_CSP;

    expect(d.defaultSrc).toEqual(["'self'"]);
    expect(d.frameAncestors).toEqual(["'none'"]);
    expect(d.objectSrc).toEqual(["'none'"]);
    // Nenhuma diretiva pode liberar host externo.
    const tudo = Object.values(d).flat().join(' ');
    expect(tudo).not.toMatch(/https?:\/\//);
  });
});

describe('CORS', () => {
  const chamar = (seguranca, origem) =>
    new Promise((resolve) => {
      seguranca.opcoesCors().origin(origem, (_e, permitido) => resolve(permitido));
    });

  test('sem CORS_ORIGINS, nenhuma origem cruzada é aceita', async () => {
    delete process.env.CORS_ORIGINS;
    jest.resetModules();
    const s = require('../../src/config/seguranca');

    expect(await chamar(s, 'https://site-qualquer.com')).toBe(false);
  });

  test('requisição sem Origin passa — não é requisição de navegador', async () => {
    delete process.env.CORS_ORIGINS;
    jest.resetModules();
    const s = require('../../src/config/seguranca');

    expect(await chamar(s, undefined)).toBe(true);
  });

  test('só as origens listadas em CORS_ORIGINS passam', async () => {
    process.env.CORS_ORIGINS = 'https://sga.exemplo.com, https://admin.exemplo.com';
    jest.resetModules();
    const s = require('../../src/config/seguranca');

    expect(await chamar(s, 'https://sga.exemplo.com')).toBe(true);
    expect(await chamar(s, 'https://admin.exemplo.com')).toBe(true);
    expect(await chamar(s, 'https://invasor.com')).toBe(false);
  });

  test('a lista tolera espaços e itens vazios', () => {
    process.env.CORS_ORIGINS = ' https://a.com ,, https://b.com , ';
    jest.resetModules();
    const s = require('../../src/config/seguranca');

    expect(s.origensPermitidas()).toEqual(['https://a.com', 'https://b.com']);
  });
});

describe('redirecionamento para HTTPS', () => {
  const requisicao = (extra = {}) => ({
    secure: false, headers: { host: 'sga.exemplo.com' }, originalUrl: '/ordens', ...extra,
  });
  const resposta = () => ({ redirect: jest.fn() });

  test('em desenvolvimento NÃO redireciona — o ambiente local é http', () => {
    comAmbiente('development', (s) => {
      const res = resposta();
      const next = jest.fn();
      s.redirecionarParaHttps(requisicao(), res, next);

      expect(next).toHaveBeenCalled();
      expect(res.redirect).not.toHaveBeenCalled();
    });
  });

  test('em produção, http vira https com 301', () => {
    comAmbiente('production', (s) => {
      const res = resposta();
      s.redirecionarParaHttps(requisicao(), res, jest.fn());

      expect(res.redirect).toHaveBeenCalledWith(301, 'https://sga.exemplo.com/ordens');
    });
  });

  test('em produção atrás de proxy, X-Forwarded-Proto https não redireciona', () => {
    comAmbiente('production', (s) => {
      const res = resposta();
      const next = jest.fn();
      const req = requisicao({
        headers: { host: 'sga.exemplo.com', 'x-forwarded-proto': 'https' },
      });
      s.redirecionarParaHttps(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.redirect).not.toHaveBeenCalled();
    });
  });

  test('em produção já sob TLS direto, não redireciona', () => {
    comAmbiente('production', (s) => {
      const res = resposta();
      const next = jest.fn();
      s.redirecionarParaHttps(requisicao({ secure: true }), res, next);

      expect(next).toHaveBeenCalled();
      expect(res.redirect).not.toHaveBeenCalled();
    });
  });
});
