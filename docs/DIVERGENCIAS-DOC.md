# Divergências entre o documento do TCC e o código

**Data do levantamento:** 05/10/2026
**Código analisado:** branch `main` consolidada, commit `08a2e8c` (Módulos 1 a 5)

---

## 0. Escopo e limitação deste levantamento

> **Leia isto antes de usar a tabela.** A monografia não estava disponível no
> repositório nem no ambiente local quando este levantamento foi feito.
>
> O arquivo `sandbox/tcc.html`, apontado como "o documento", é na verdade um
> **painel de acompanhamento** gerado em 04/08/2026 — uma página de status com
> progresso dos módulos e backlog. Ele não contém capítulos, requisitos
> numerados RF001–RF023, requisitos não funcionais, nem a Figura 4 (DER). As
> afirmações sobre Tailwind, Axios, JWT e Sequelize **não estão nele**.

Diante disso, este documento cobre o que foi possível verificar de primeira mão:

| Fonte | O que foi feito |
|---|---|
| As três divergências nomeadas no plano de trabalho | Conferidas uma a uma contra o código. São leitura do Endrik sobre a monografia, e todas se confirmaram (seção 1) |
| `sandbox/tcc.html` | Comparado integralmente com o estado atual (seção 2) |
| Requisitos não funcionais citados no plano (NF004–NF008) | Verificado o que existe de fato no código (seção 3) |
| Varredura do código | Defeitos encontrados durante a verificação, que não são divergência de texto (seção 4) |

**Esta lista não pode ser declarada completa** enquanto a monografia não for
comparada parágrafo a parágrafo. Tudo que depende do texto exato está marcado
com `[VALIDAR: ...]`.

---

## 1. Stack e arquitetura

Todas confirmadas por inspeção direta do `package.json` e por varredura em
`src/`, `views/`, `public/` e `prisma/`.

| # | O que o documento afirma | O que o código faz | Recomendação | Justificativa |
|---|---|---|---|---|
| A1 | Usa **Tailwind CSS** | CSS próprio, escrito à mão: `public/css/style.css`, 383 linhas, com classes do projeto (`btn`, `form-box`, `tabela-box`, `badge`, `cards`). **Zero ocorrências** de "tailwind" no repositório | **Ajustar o texto** | Trocar a stack visual agora significaria reescrever as 23 views EJS às vésperas da entrega, sem ganho funcional nenhum. O CSS próprio é coerente, pequeno e já está documentado nos LEIAMEs |
| A2 | Usa **Axios** | Nenhuma ocorrência. As telas são formulários EJS com `POST` nativo do navegador; a única chamada assíncrona é um `fetch()` nativo em `src/routes/equipamentoRoutes.js`, usado pelo formulário de OS para carregar equipamentos do cliente | **Ajustar o texto** | Axios é uma dependência que o projeto conscientemente não tem. Adicioná-la só para casar com o texto aumentaria a superfície do projeto sem resolver problema algum |
| A3 | Usa **Sequelize ou Prisma** | **Prisma 5.22** (`@prisma/client` + `prisma`). Nenhuma ocorrência de Sequelize | **Ajustar o texto** | A alternativa no texto provavelmente é resquício da fase de escolha de tecnologia. Basta remover "Sequelize ou" e afirmar Prisma |
| A4 | "Autenticação baseada em **tokens (JWT)**" | **Dois mecanismos coexistem**, e o JWT é o minoritário: as telas web (`/`, todas as 23 views) usam `express-session` com cookie, via `sessaoMiddleware`; o JWT vale só para as rotas `/api/*`, via `authMiddleware` | **Ajustar o texto** | O texto não está errado, está incompleto — descreve só metade do sistema. A banca que entrar pelo navegador não vai ver token nenhum. Ver o detalhamento abaixo |

### A4 em detalhe — quem protege o quê

| Faixa de rotas | Mecanismo | Middleware | Arquivo |
|---|---|---|---|
| `/dashboard`, `/clientes`, `/ordens`, `/produtos`, `/financeiro`, `/relatorios`, … (todas as telas) | Sessão + cookie | `sessaoMiddleware` + `exigirPerfil` | `src/routes/webRoutes.js` |
| `/api/clientes`, `/api/produtos`, `/api/financeiro`, `/api/ordens`, `/api/equipamentos` | JWT `Bearer` | `authMiddleware` + `exigirPerfilApi` | `src/routes/*Routes.js` |
| `/consulta` (consulta pública de OS) | Nenhum, por decisão de projeto | — | `src/routes/webRoutes.js` |
| `/api/auth/login`, `/api/auth/usuarios` | **Nenhum** | — | `src/routes/authRoutes.js` |

A última linha é um defeito de segurança, não uma escolha. Ver **D01**.

**Texto sugerido para a monografia:**

> A autenticação é feita por dois mecanismos complementares. A interface web
> utiliza sessão de servidor com cookie assinado (`express-session`), adequada à
> navegação por formulários. A API REST, destinada a integrações, utiliza tokens
> JWT com validade de 8 horas. Em ambos os casos, a autorização por perfil é
> aplicada por middleware dedicado, rota a rota.

`[VALIDAR: conferir o trecho exato da monografia antes de substituir.]`

---

## 2. Painel `tcc.html` — defasado em quase tudo

O painel é de 04/08/2026 e descreve um projeto que parou no Módulo 3. Ele não é
a monografia, mas **é um documento do projeto** e, se for anexado ou apresentado,
contradiz o sistema entregue.

| # | O que o painel afirma | Situação real hoje | Recomendação |
|---|---|---|---|
| B1 | "Módulo atual: **3**, parte 2 — serviços e garantia" | Cinco módulos concluídos e consolidados na `main` | Regerar ou aposentar o painel |
| B2 | "Módulo 5 — **não iniciado**. Escopo ainda não definido" | Módulo 5 concluído: RF016–RF019, dashboards, CSV, catálogo de tipos | Regerar |
| B3 | "Branch `modulo3-servicos` — **ainda não enviada ao GitHub**" | `main` consolidada e publicada (`08a2e8c`) | Regerar |
| B4 | "Testes unitários **10/10** — suíte do Felipe" | **175** testes unitários | Regerar |
| B5 | "**126** unitários e **67** de integração" (seção Testar) | 175 unitários e 162 de integração, dos quais 159 passam | Regerar |
| B6 | "Testes E2E **39/39** no ambiente de preview" | O E2E do sandbox tem 163 casos — e **não é a prova oficial**: a cobertura passou para `tests/integration/` | Regerar, e não citar o E2E do sandbox na monografia: ele vive em `sandbox/`, que não é versionado |
| B7 | "O Módulo 4 exige aplicar `docs/migration-modulo4-mysql.sql`" | **Esse arquivo nunca existiu** no repositório. As migrations são versionadas em `prisma/migrations/` e aplicadas com `npm run db:mysql` | Corrigir: a instrução está errada e levaria quem seguir o painel a um arquivo inexistente |
| B8 | Backlog P01: "testes do Felipe usam `usuario.email`, campo que não existe" | **Continua verdadeiro.** São as 3 falhas de `tests/integration/auth.test.js` | Manter no backlog até decidir (ver D06) |
| B9 | Backlog P02: "não há testes do Módulo 3 na suíte Jest" | Resolvido: `tests/integration/garantia.test.js` | Marcar como resolvido |
| B10 | Backlog P05: "falta tela consolidada de serviços em garantia para a gestão" | Parcialmente resolvido: há o bloco 🛡️ Garantias no dashboard (perfil TECNICO) e o histórico por equipamento (RF012). **Não há** uma listagem geral de todas as garantias vigentes | Manter no backlog, com o escopo reduzido |
| B11 | Backlog P06: "definir escopo dos Módulos 4 e 5" | Resolvido: ambos entregues e documentados | Marcar como resolvido |

> **Recomendação geral sobre o painel:** ele cumpriu o papel de acompanhamento
> durante o desenvolvimento. Para a entrega, ou se regenera com os números
> atuais, ou se declara explicitamente que é um registro histórico de 04/08/2026.
> O que não dá é anexá-lo como se descrevesse o sistema entregue.

---

## 3. Requisitos não funcionais

O plano de trabalho cita NF004 a NF008. `[VALIDAR: NF001, NF002 e NF003 não
foram citados e o texto da monografia não estava disponível — levantar.]`

**Nenhum "NF" aparece citado em lugar nenhum do código ou dos LEIAMEs** (a
varredura por `NF[0-9]{3}` não retornou nada), ao contrário dos RFs, que estão
marcados nos comentários. Isso por si só é uma divergência de rastreabilidade.

| # | O documento promete | O que existe no código | Recomendação | Justificativa |
|---|---|---|---|---|
| C1 | **NF004** — análise geográfica | `Cliente` tem `cidade`, `estado`, `cep`, `bairro`, mas **nenhum relatório agrupa por eles**. Os quatro relatórios do Módulo 5 agrupam por cliente, produto, tipo de serviço e tipo de equipamento | **Ajustar o texto**, movendo para trabalhos futuros | O dado está modelado; falta só a consulta. Mas é um relatório novo a dez minutos da entrega. O plano já prevê isso como trabalho futuro na Fase 8 |
| C2 | **NF005** — rastreabilidade / log de auditoria | **Não existe.** Nenhum model `LogAuditoria`, nenhum middleware de log. Nem sequer se registra quem executou um serviço | **Ajustar o código** | É a Fase 4 do plano. Diferente dos demais, este tem escopo fechado e cabe no prazo |
| C3 | **NF006** — backup | **Não existe.** Nenhum script, nenhuma documentação, nenhuma menção a `mysqldump` | **Ajustar o código** (é a Fase 5) | Um script de dump e um `docs/BACKUP.md` são baratos e verificáveis |
| C4 | **NF007** — segurança na comunicação | Parcial e frouxo: `helmet` está instalado mas com **`contentSecurityPolicy: false`**; `cors()` está **aberto a qualquer origem**; o cookie de sessão define só `maxAge`, sem `secure` nem `sameSite`; não há redirecionamento HTTP→HTTPS | **Ajustar o código** (é a Fase 5) | O texto promete segurança de comunicação e hoje o que existe é a configuração padrão com a proteção mais importante desligada |
| C5 | **NF008** — retenção e descarte (LGPD) | Exclusão lógica existe em **4 de 12** models (`Usuario`, `Cliente`, `TipoServico`, `Produto`). Não há **nenhuma** rotina de anonimização de dados pessoais, e `Cliente` guarda nome, CPF/CNPJ, RG, data de nascimento, endereço completo, telefone, celular e e-mail | **Ajustar o código** (é a Fase 5) | É o requisito com maior exposição: há dado pessoal sensível modelado e nenhuma política implementada |

---

## 4. Defeitos encontrados durante o levantamento

Estes **não são divergências de texto** — são problemas do código, achados ao
verificar as afirmações acima. Entram aqui porque qualquer um deles contradiz o
que a monografia afirma sobre controle de acesso.

| # | Defeito | Gravidade | Evidência | Recomendação |
|---|---|---|---|---|
| **D01** | `POST /api/auth/usuarios` não exigia autenticação nenhuma e aceitava `perfilId` no corpo. Qualquer pessoa com acesso à porta criava um usuário `ADMINISTRADOR` e obtinha um token JWT válido em seguida | **Crítica** | **CORRIGIDO** — ver 4.1 | — |
| **D02** | Segredo de sessão com fallback fixo no código: `process.env.SESSION_SECRET \|\| 'sga_ti_secret'`. Sem a variável no ambiente, as sessões eram assinadas com um segredo público e versionado | Alta | **CORRIGIDO** — ver 4.1 | — |
| **D03** | `/api/usuarios` é um namespace **vazio**: `src/routes/usuarioRoutes.js` só tem `router.use(authMiddleware)`, sem nenhuma rota | Baixa | `GET /api/usuarios` com token válido devolve `404` | **Ajustar o código:** implementar ou remover. Um router montado que não atende nada é dívida |
| **D04** | `src/routes/ordemServicoRoutes.js:6` tem registro aninhado: `router.get('/', router.get('/', ordemServicoController.listar))` — o retorno de `router.get` é o próprio router, que acaba passado como handler | Baixa | `GET /api/ordens` devolve `200` e a lista correta — funciona por acaso, porque o registro interno resolve primeiro | **Ajustar o código:** erro de digitação que hoje não quebra, mas é frágil |
| **D05** | `src/routes/equipamentoRoutes.js` chama `router.use(authMiddleware)` **depois** da única rota, então o JWT não protege endpoint algum ali | Baixa | `GET /api/equipamentos/cliente/1` sem token devolve `302` (barrado pela sessão, não pelo JWT); `GET /api/equipamentos` devolve `401` apenas porque nada casa | **Ajustar o código:** a rota existente é de uso interno das telas e está corretamente protegida por sessão. O `router.use` ali induz a erro |
| **D06** | `tests/integration/auth.test.js` falha nos 3 casos desde antes da consolidação, por usar `usuario.email` e `usuario.perfil` como texto | Média | `PrismaClientValidationError` no `upsert` | `[VALIDAR: decisão da dupla.]` Corrigir, remover ou manter. Manter deixa `npm test` permanentemente vermelho, o que é difícil de defender numa banca |

### 4.1 Correção aplicada no D01 e no D02

Os dois foram corrigidos em 05/10/2026, **antes** de este documento ser
publicado — o repositório é público, e descrever um desvio de autenticação
ainda aberto seria entregar o roteiro pronto.

| Defeito | Correção | Arquivo |
|---|---|---|
| D01 | A rota passou a exigir `authMiddleware` + `exigirPerfilApi()`, que sem argumentos libera só o `ADMINISTRADOR` — a mesma regra que `/usuarios` já tinha nas telas web. O `POST /api/auth/login` continua público, porque é por onde se obtém o token | `src/routes/authRoutes.js` |
| D02 | O fallback saiu. Na ausência de `SESSION_SECRET` a aplicação **recusa subir**, com mensagem apontando o `docs/COMO-RODAR.md`. É o mesmo comportamento que o `JWT_SECRET` já tinha | `src/app.js` |

O primeiro administrador não depende da rota: nasce do `prisma/seed.js`.

**Verificação.** A mesma prova que antes criava um administrador foi repetida
após a correção:

| Antes | Depois |
|---|---|
| `201`, usuário gravado como `ADMINISTRADOR`, token obtido na sequência | `401 {"erro":"Token não fornecido."}`, nada gravado no banco |

Oito testes de regressão entraram em `tests/integration/api.test.js`, no bloco
`criação de usuário pela API (RF022 / RF023)`: sem token devolve 401; cada um
dos cinco perfis não administrativos devolve 403; o `ADMINISTRADOR` cria
normalmente; e o login segue público. A suíte de integração passou de 159 para
**167 casos passando**.

Para o D02, verificado nos dois sentidos: com o segredo ausente a aplicação
lança o erro e não sobe; com o segredo presente, carrega normalmente.

> **Observação sobre o D01 e o D06:** o `authController.login` já foi corrigido
> em algum momento para aceitar `login` além de `email`, com comentário
> explicando que a rota era inusável antes. A correção não alcançou o
> `auth.test.js`, que continua montando o cenário pelo campo inexistente.

---

## 5. Resumo das recomendações

| Ação | Itens | Esforço |
|---|---|---|
| **Ajustar só o texto da monografia** | A1, A2, A3, A4, C1 | Baixo — é reescrita de parágrafo |
| **Regerar ou aposentar o painel `tcc.html`** | B1–B11 | Baixo |
| ~~Corrigir o código, urgente~~ | ~~D01, D02~~ — **feito**, ver 4.1 | — |
| **Corrigir o código, quando sobrar fôlego** | D03, D04, D05 | Baixo |
| **Implementar o que o documento promete** | C2 (Fase 4), C3/C4/C5 (Fase 5) | Médio — já está no plano |
| **Decidir** | D06, e o escopo de NF001–NF003 | — |

### Princípio aplicado

Seguindo a regra do plano, **nenhuma recomendação propõe mudar a arquitetura
para casar com o texto**. Tailwind, Axios e Sequelize são divergências que se
resolvem corrigindo a redação: o projeto funciona, está testado e documentado
como está, e trocar a stack por fidelidade ao texto seria risco sem retorno.

As recomendações de mudar código (D01, D02 e os NFs) são de natureza diferente:
não existem para casar com o documento, existem porque o sistema está errado ou
incompleto independentemente do que o texto diga.

---

## 6. Pendências de validação

1. `[VALIDAR: localizar a monografia]` — este levantamento precisa ser refeito
   contra o documento real. Sem ele, a seção 1 cobre apenas as três divergências
   já conhecidas, e a lista não pode ser declarada completa.
2. `[VALIDAR: NF001, NF002 e NF003]` — não citados no plano, não encontrados no
   código.
3. `[VALIDAR: Figura 4 — o DER]` — a comparação é a Fase 3 e será feita a partir
   do `prisma/schema.prisma`, mas a figura atual do documento não estava
   disponível para o confronto lado a lado.
4. `[VALIDAR: RF001, RF002, RF003, RF005, RF009, RF010, RF011]` — não aparecem
   citados em nenhum comentário do código, ao contrário dos demais. São
   provavelmente os Módulos 1 e 2 (login, cadastros e OS), implementados antes de
   a convenção de marcar o RF no comentário existir. A Fase 8 confirma.
