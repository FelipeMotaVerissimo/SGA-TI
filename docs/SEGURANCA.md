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
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
img-src 'self' data:; font-src 'self'; connect-src 'self'; form-action 'self';
frame-ancestors 'none'; frame-src 'none'; object-src 'none'; base-uri 'self'
```

O que isso fecha: o sistema não carrega script, estilo, fonte ou frame de
**nenhuma origem externa**, não pode ser embutido em iframe de terceiro
(clickjacking), e formulários só podem postar para o próprio domínio.

### Scripts: sem `'unsafe-inline'` desde 15/10/2026

Até 15/10/2026 o `script-src` tinha `'unsafe-inline'`, porque as views dependiam
de script embutido: dois blocos `<script>` (`views/ordens/form.ejs` e
`views/produtos/estoque.ejs`), doze handlers `return confirm(...)` em seis
views e um `onchange`. Com a permissão, o CSP não defendia contra XSS.

Tudo isso foi para `public/js/`:

| Arquivo | O que faz | Substituiu |
|---|---|---|
| `confirmar.js` | Um único ouvinte de `submit` no documento: se o formulário tem `data-confirmar="..."`, pergunta antes de enviar | os 12 `onsubmit`/`onclick` com `confirm(...)` |
| `ordem-form.js` | Carrega os equipamentos do cliente escolhido no formulário de OS | o `<script>` e o `onchange` de `ordens/form.ejs` |
| `estoque.js` | Mostra o bloco de conta a pagar só em ENTRADA | o `<script>` de `produtos/estoque.ejs` |
| `menu.js` | Menu recolhível no celular (já existia) | — |

O `confirmar.js` é carregado pelo `partials/sidebar.ejs`, junto com o
`menu.js`, e por isso está em toda tela autenticada.

A troca corrigiu dois defeitos, registrados como D07 e D08 em
`docs/DIVERGENCIAS-DOC.md`, seção 4.2: confirmações que não apareciam e texto
de cadastro interpretado como HTML no formulário de OS.

**O que impede a volta.** O `supertest` não executa JavaScript, então um
handler embutido esquecido passaria por todos os testes de integração e só
quebraria no navegador. Por isso `tests/unit/seguranca.test.js` varre as
views e falha se encontrar atributo `on...=`, `<script>` sem `src`, link
`javascript:` ou `innerHTML`.

**Verificado no navegador** (Chromium, 15/10/2026): cabeçalho com
`script-src 'self'`; os 12 pontos de confirmação perguntam, barram o envio
ao cancelar e deixam seguir ao confirmar; o formulário de OS carrega os
equipamentos; o bloco de conta a pagar do estoque alterna; o menu abre em
375 px; nenhuma violação de CSP no console. Um handler `onerror` injetado à
força na página foi bloqueado pelo navegador.

### Estilos: `'unsafe-inline'` continua

As views usam `style="..."` em dezenas de pontos, além das classes do
`style.css`. Isso continua como dívida conhecida (P07). O risco é bem menor que
o de script — CSS embutido não executa código —, mas ainda permite que HTML
injetado altere a aparência da página.

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

## 4.1 Limite de tentativas de login

Antes disto nada impedia força bruta: dava para disparar senhas contra `/login`
e `/api/auth/login` indefinidamente, e o `bcrypt` — lento de propósito — virava
vetor de negação de serviço em vez de defesa.

**10 tentativas falhas por IP, em janela de 15 minutos.** Implementado com
`express-rate-limit` em `src/config/seguranca.js`.

| Decisão | Motivo |
|---|---|
| Só contam as tentativas **que falham** | É isso que define força bruta. Quem acerta a senha não consome cota, então um balcão com vários atendentes no mesmo IP não é penalizado |
| A resposta muda conforme a rota | A tela devolve ao login com mensagem; a API devolve `429` em JSON. Responder HTML para a API confundiria quem a consome |
| O `store` é instanciado explicitamente | Para poder ser zerado entre as suítes, que rodam no mesmo processo |

### O critério de sucesso teve de ser redefinido

O padrão da biblioteca considera bem-sucedida toda resposta com status abaixo de
400. **Isso está errado para este sistema:** o login recusado pela tela responde
`302`, redirecionando de volta para `/login`. Pelo critério padrão, errar a senha
pela interface web contava como acerto e a trava **nunca disparava** — funcionava
apenas na API, que responde `401`.

Foi descoberto em teste, e a correção é a função `requestWasSuccessful`: só
redirecionar para `/dashboard` significa que entrou.

> Vale como registro de método: o primeiro teste da trava passava na API e
> falhava na web. A tentação seria ajustar o teste; a causa era o código.

---

## 4.2 Token CSRF nos formulários

Implementado em 15/10/2026, em `src/middlewares/csrfMiddleware.js`, sem
dependência nova (o `csurf` está descontinuado).

O `sameSite=lax` do cookie já impede que outro site envie um formulário ao
sistema com a sessão do usuário. O token é a segunda camada, e a que não
depende de o navegador respeitar o `sameSite`.

**Regra.** Toda requisição de escrita (`POST`, `PUT`, `PATCH`, `DELETE`) feita
com usuário logado precisa trazer o token da sessão, no campo `_csrf` do
formulário ou no cabeçalho `X-CSRF-Token`. Sem ele, ou com outro valor, a
resposta é **403** com a página "Formulário expirado", e a ação não acontece.

| Decisão | Motivo |
|---|---|
| Um token por sessão, 32 bytes aleatórios | Outro site não consegue ler as páginas do sistema, logo não sabe o token |
| Comparação em tempo constante (`timingSafeEqual`) | O tempo de resposta não revela quantos caracteres conferem |
| Fora da regra: requisição sem usuário logado | Não há sessão a sequestrar. Inclui a consulta pública e a sessão expirada, que continua indo para o login, e não para o 403 |
| Fora da regra: `POST /login` | O login descarta a sessão anterior e cria outra. E o formulário de login só aparece para quem não está logado, logo nunca tem token: exigir recusaria a tela de login aberta numa segunda aba. Pego pela suíte, no teste de cota de login |
| Fora da regra: `/api/*` | A API autentica por JWT no cabeçalho `Authorization`, que o navegador não envia sozinho |
| 403 com página própria, e não flash + redirect | A ação foi recusada, e o status diz isso no log |

**Onde o token entra na tela.** Os 29 formulários POST das telas autenticadas
incluem `views/partials/csrf.ejs`, um campo oculto. Os outros dois formulários
POST do sistema são o login e a consulta pública, que não têm sessão.
`tests/unit/csrf.test.js` varre as views e falha se aparecer formulário POST
sem o parcial.

**Duas mudanças que vieram junto:**

- **"Sair" é um formulário POST com token.** Antes era `GET /logout`, e
  qualquer página de outro site podia derrubar a sessão do usuário com uma
  imagem apontando para o endereço. O botão mantém a aparência do link.
- **O login regenera a sessão** (`req.session.regenerate`). O identificador de
  sessão anterior ao login deixa de valer, e o token nasce com a sessão nova.

**Verificado no navegador** (Chromium, 15/10/2026): login pelo formulário;
desativar e reativar um tipo de serviço e editar um cliente pela interface
deram certo; `POST` forjado sem token e com token errado deram 403, sem
alterar o banco; um formulário com o token adulterado mostrou a página
"Formulário expirado" e não excluiu o cliente; "Sair" encerrou a sessão.

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
| Unitários | `tests/unit/seguranca.test.js` | 24 |
| Unitários | `tests/unit/csrf.test.js` | 22 |
| Integração | `tests/integration/seguranca.test.js` | 19 |
| Integração | `tests/integration/csrf.test.js` | 16 |

Os unitários cobrem a decisão produção × desenvolvimento de cada proteção. Os de
integração verificam o que a aplicação **de fato responde**: CSP presente,
`frame-ancestors 'none'`, nenhuma origem externa no cabeçalho, `nosniff`,
`X-Powered-By` ausente, HSTS ausente fora de produção, cookie `HttpOnly` e
`SameSite=Lax` mas **não** `Secure`, origem externa sem autorização de CORS, e
o sistema continuando a responder em HTTP.

Desde 15/10/2026 entram também: `script-src` exatamente `'self'` no cabeçalho
real; a varredura das views contra script embutido e `innerHTML` (seção 3);
a presença do `confirmar.js` e do `data-confirmar` na tela de clientes; e a
mensagem de anonimização com o nome do cliente escapado, apóstrofo e quebras
de linha preservados.

Os de CSRF (seção 4.2) cobrem cada ramo da regra com requisição simulada e,
ponta a ponta, o 403 sem token, com token errado e com token de **outra
sessão** — conferindo no banco que nada mudou —, a troca de token e de cookie
no login, o "Sair" e o que continua sem token: login, consulta pública, API
e escrita sem sessão. Rodados sem a implementação, 9 dos 16 de integração
falham; a varredura das views também falha sem o parcial nos formulários.

---

## 7. Pendências

| # | Item | Prioridade |
|---|---|---|
| P01 | ~~`'unsafe-inline'` em `script-src`~~ — **resolvido** em 15/10/2026, ver seção 3 | — |
| P02 | ~~Não há proteção CSRF por token~~ — **resolvido** em 15/10/2026, ver seção 4.2 | — |
| P03 | ~~Não há limite de tentativas de login~~ — **resolvido**, ver seção 4.1 | — |
| P04 | A sessão vive em memória (`MemoryStore`): cai a cada reinício e não funciona com mais de uma instância. Em produção precisa de store externo | média |
| P05 | O ciclo HTTPS real não foi exercitado — não há ambiente com TLS. A lógica está testada, o comportamento sob TLS de verdade não | média |
| P06 | Sem cabeçalho `Permissions-Policy` nem `Cross-Origin-*` | baixa |
| P07 | `'unsafe-inline'` em `style-src`: as views usam `style="..."` em dezenas de pontos. Remover exige mover esses estilos para classes do `style.css` | baixa |
