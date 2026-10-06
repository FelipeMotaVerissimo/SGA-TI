# NF007 — Segurança na comunicação

**Versão:** V01
**Data:** 06/10/2026
**Requisito:** NF007 — proteção da comunicação entre cliente e servidor

---

## 1. Ponto de partida

O `helmet` e o `cors` já estavam nas dependências, mas configurados de um jeito
que entregava pouco:

```js
app.use(helmet({ contentSecurityPolicy: false }));  // a principal proteção, desligada
app.use(cors());                                     // aberto para qualquer origem
app.use(session({ cookie: { maxAge: ... } }));       // sem secure, sem sameSite
```

Tudo foi reunido em `src/config/seguranca.js`, num lugar só e testável.

**Regra que guiou todas as decisões: nada pode quebrar o ambiente local em
HTTP.** Cada proteção que exige TLS é ligada apenas quando `NODE_ENV` é
`production`. Em desenvolvimento o sistema continua subindo em
`http://localhost:3000` sem nenhum ajuste.

---

## 2. O que foi ligado

| Proteção | Desenvolvimento | Produção | Por quê |
|---|---|---|---|
| **CSP** | ligado | ligado | Bloqueia script, estilo, frame e fonte de origem externa |
| **HSTS** | **desligado** | 180 dias, `includeSubDomains` | Ver 2.1 |
| **`upgrade-insecure-requests`** | **desligado** | ligado | Ver 2.2 |
| **Redirecionamento HTTP→HTTPS** | desligado | 301 | O ambiente local é HTTP |
| **Cookie `secure`** | desligado | ligado | Senão nenhuma sessão funcionaria em `http://localhost` |
| **Cookie `httpOnly`** | ligado | ligado | Tira o roubo de sessão do alcance de um XSS |
| **Cookie `sameSite=lax`** | ligado | ligado | Barra CSRF sem quebrar navegação nem links externos |
| **CORS restrito** | ligado | ligado | Só as origens de `CORS_ORIGINS` |
| **`noSniff`** | ligado | ligado | O navegador não adivinha o tipo do conteúdo |
| **`X-Powered-By` removido** | ligado | ligado | Não anunciar a stack |
| **`trust proxy`** | desligado | ligado | Ver 2.3 |

### 2.1 Por que o HSTS fica desligado em desenvolvimento

HSTS diz ao navegador "deste host, só aceite HTTPS, pelos próximos N dias". Se o
cabeçalho pegar em `localhost`, o navegador passa a exigir HTTPS em `localhost`
— **e não só para este projeto**. Qualquer outro sistema que a pessoa rode na
mesma porta para de funcionar, e limpar isso exige mexer nas configurações
internas do navegador.

### 2.2 O defeito que a verificação no navegador pegou

Ao ligar o CSP, o sistema passou a falhar no ambiente local com
`ERR_SSL_PROTOCOL_ERROR`. A tela carregava, mas qualquer requisição seguinte
morria.

Causa: o `helmet` **mescla** as diretivas informadas com as padrão dele, e entre
as padrão está `upgrade-insecure-requests`, que manda o navegador trocar toda
requisição HTTP por HTTPS. Em `http://localhost` o navegador tentava falar TLS
com um servidor sem TLS.

Correção: `useDefaults: false`, de modo que o cabeçalho seja exatamente a lista
declarada no arquivo — sem surpresa de versão da biblioteca —, e
`upgrade-insecure-requests` acrescentado só em produção.

> Vale registrar **como** foi encontrado: os testes de integração não pegaram.
> O `supertest` lê o cabeçalho mas não obedece a ele; só um navegador de verdade
> executa a diretiva. Hoje existe teste de regressão para os dois lados
> (`tests/unit/seguranca.test.js` e `tests/integration/seguranca.test.js`).

### 2.3 `trust proxy`

Em hospedagem gratuita (Render, Railway, Fly.io) o TLS termina no proxy da
plataforma, e a aplicação recebe a requisição em HTTP com o protocolo original
no cabeçalho `X-Forwarded-Proto`. Sem `trust proxy`, o Express ignora esse
cabeçalho e o redirecionamento entraria em laço infinito.

Ligar isso **também resolve a pendência P02 do NF005**: `req.ip` passa a devolver
o IP real do cliente, e não o do proxy, o que corrige o IP gravado no log de
auditoria.

Fica desligado em desenvolvimento de propósito: não há proxy, e confiar num
cabeçalho forjável seria o oposto de segurança.

---

## 3. A Política de Segurança de Conteúdo

Cabeçalho efetivamente enviado:

```
default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';
img-src 'self' data:; font-src 'self'; connect-src 'self'; form-action 'self';
frame-ancestors 'none'; frame-src 'none'; object-src 'none'; base-uri 'self'
```

O que isso fecha: o sistema não carrega script, estilo, fonte ou frame de
**nenhuma origem externa**, não pode ser embutido em iframe de terceiro
(clickjacking), e formulários só podem postar para o próprio domínio.

### O `'unsafe-inline'`, que é dívida conhecida

Ele aparece duas vezes, e as duas são dívida assumida, não descuido:

| Onde | Motivo |
|---|---|
| `style-src` | As views usam `style="..."` em dezenas de pontos, além das classes do `style.css` |
| `script-src` | Há dois blocos `<script>` embutidos (`views/ordens/form.ejs` e `views/produtos/estoque.ejs`) e onze handlers `onclick` nas listagens, quase todos `return confirm(...)` |

Com `'unsafe-inline'` em `script-src`, o CSP deixa de ser defesa contra XSS
refletido — essa é a parte honesta a dizer numa defesa. O que ele ainda entrega
é o bloqueio de origem externa, que não é pouco.

**Como remover** (pendência P01): mover os dois blocos de script e os onze
handlers para um arquivo em `public/js/`, usando `addEventListener` em vez de
`onclick`. É trabalho mecânico, de baixo risco, mas toca seis views e não cabia
no prazo deste requisito sem risco de quebrar tela que funciona.

---

## 4. CORS

Antes era `cors()` puro, que responde `Access-Control-Allow-Origin: *` para
qualquer um.

Agora a lista vem da variável `CORS_ORIGINS`, separada por vírgula:

```
CORS_ORIGINS="https://sga.exemplo.com,https://admin.exemplo.com"
```

| Situação | Resultado |
|---|---|
| `CORS_ORIGINS` definido, origem na lista | Autorizada |
| `CORS_ORIGINS` definido, origem fora da lista | Negada |
| `CORS_ORIGINS` vazio ou ausente | **Nenhuma** origem cruzada autorizada |
| Requisição sem cabeçalho `Origin` | Passa — não é requisição de navegador, e o CORS não a governa (Postman, curl, servidor para servidor) |

As telas são servidas pelo próprio Express, portanto são sempre same-origin e
não dependem disto. O CORS existe só para a API `/api/*`.

---

## 5. Variáveis de ambiente

| Variável | Efeito |
|---|---|
| `NODE_ENV=production` | Liga HSTS, `upgrade-insecure-requests`, redirecionamento HTTPS, cookie `secure` e `trust proxy` |
| `CORS_ORIGINS` | Lista de origens autorizadas na API. Vazio = nenhuma |
| `SESSION_SECRET` | **Obrigatória.** Sem ela a aplicação recusa subir (corrigido na Fase 2) |
| `JWT_SECRET` | **Obrigatória** para a API |

---

## 6. Testes

| Suíte | Arquivo | Casos |
|---|---|---|
| Unitários | `tests/unit/seguranca.test.js` | 19 |
| Integração | `tests/integration/seguranca.test.js` | 13 |

Os unitários cobrem a decisão produção × desenvolvimento de cada proteção. Os de
integração verificam o que a aplicação **de fato responde**: CSP presente,
`frame-ancestors 'none'`, nenhuma origem externa no cabeçalho, `nosniff`,
`X-Powered-By` ausente, HSTS ausente fora de produção, cookie `HttpOnly` e
`SameSite=Lax` mas **não** `Secure`, origem externa sem autorização de CORS, e
o sistema continuando a responder em HTTP.

---

## 7. Pendências

| # | Item | Prioridade |
|---|---|---|
| P01 | `'unsafe-inline'` em `script-src` — ver seção 3 | média |
| P02 | **Não há proteção CSRF por token.** O `sameSite=lax` cobre o caso comum, mas não substitui um token por formulário (`csurf` ou equivalente) | média |
| P03 | **Não há limite de tentativas de login.** Nada impede força bruta em `/login` nem em `/api/auth/login`. `express-rate-limit` resolveria | **alta** |
| P04 | A sessão vive em memória (`MemoryStore`): cai a cada reinício e não funciona com mais de uma instância. Em produção precisa de store externo | média |
| P05 | O ciclo HTTPS real não foi exercitado — não há ambiente com TLS. A lógica está testada, o comportamento sob TLS de verdade não | média |
| P06 | Sem cabeçalho `Permissions-Policy` nem `Cross-Origin-*` | baixa |
