# SGA TI — Módulo 4: Gerenciamento de Produtos e Financeiro

**Branch:** `modulo3-servicos` (continuação)
**Versão:** V04
**Data:** 16/08/2026

Cobre o Módulo 4 do cronograma (item 3.2 do documento): cadastro de produtos,
controle de estoque (entrada/saída), contas a pagar e contas a receber.
Implementa também o controle de acesso por perfil, que era a pendência P06 do
Módulo 3 e é exigido pelo RF023.

---

## 1. Requisitos atendidos

| Requisito | Onde |
|---|---|
| RF014 — cadastro de produtos utilizados nos serviços | `produtoService`, telas `/produtos` |
| RF015 — entrada de produtos no estoque pelo setor de Compras | `movimentarEstoque`, tela `/produtos/:id/estoque` |
| RF020 — registro de contas a pagar | `financeiroService`, tela `/financeiro` |
| RF021 — registro de contas a receber | idem |
| RF022 / RF023 — usuários com níveis de acesso e permissões específicas | `perfilMiddleware` + rotas |
| UC RF006 — Controlar Produtos/Estoques | fluxo completo cadastro → entrada → saída na OS |
| UC RF007 — Controlar Financeiro | contas a pagar/receber com quitação e cancelamento |

---

## 2. Decisões de projeto

Três pontos não estavam definidos no documento e foram decididos junto ao grupo:

| # | Questão | Decisão | Motivo |
|---|---|---|---|
| D1 | Saída maior que o saldo em estoque | **Permitida, com aviso** e saldo negativo | Na assistência real o cadastro de estoque fica atrás do balcão; travar a saída pararia o atendimento. O saldo negativo fica visível em vermelho e é a fila de regularização do setor de Compras |
| D2 | Conta a receber ao encerrar a OS | **Gerada automaticamente** | Encerrar a OS sem lançar o valor a receber é o furo de caixa mais comum do processo manual descrito na entrevista |
| D3 | Controle de perfil | **Implementado já no Módulo 4** | O módulo é justamente o de Compras e Financeiro; sem isso, o RF023 ficaria só no papel |

### Sobre o valor da conta gerada (D2)

O valor **não** é `orçamento + peças`. O orçamento aprovado é o valor combinado
com o cliente e, na prática da assistência, **já inclui as peças** — somar os
dois cobraria a peça duas vezes. A regra implementada é:

```
valor = valorOrcamento            (quando houver orçamento aprovado)
valor = soma dos itens da OS      (quando a OS foi encerrada sem orçamento)
```

Os dois números vão para o campo `observacoes` da conta, para o Financeiro
conferir e ajustar caso a assistência trabalhe de outro jeito.

---

## 3. Regras de negócio implementadas

### 3.1 Produtos e estoque

| # | Regra | Onde |
|---|---|---|
| RN01 | `Produto.estoque` é o saldo, `MovimentoEstoque` é o razão. Os dois só são escritos juntos, dentro de `$transaction` | `produtoService.aplicarMovimento` |
| RN02 | `atualizarProduto` ignora o campo `estoque` do formulário — saldo só muda por movimentação | `produtoService.atualizarProduto` |
| RN03 | O estoque inicial do cadastro entra como um movimento de ENTRADA, não do nada | `produtoService.criarProduto` |
| RN04 | Preço obrigatório, numérico e maior que zero. Aceita vírgula | `validarPreco` |
| RN05 | Quantidade de movimentação: inteiro maior que zero | `validarQuantidade` |
| RN06 | Tipo de movimento restrito a ENTRADA / SAIDA | `validarTipo` |
| RN07 | Saída acima do saldo é permitida e devolve aviso (D1) | `aplicarMovimento` |
| RN08 | Nome de produto não pode repetir | `criarProduto` / `atualizarProduto` |
| RN09 | Exclusão é lógica (`ativo = false`), preservando os itens de OS já lançados | `excluirProduto` |
| RN10 | Produto inativo não aceita movimentação nem lançamento em OS | `movimentarEstoque`, `lancarItem` |

### 3.2 Produtos lançados na OS

| # | Regra | Onde |
|---|---|---|
| RN11 | Produto só pode ser lançado em OS `AUTORIZADO` ou `EM_ANDAMENTO` — a mesma janela dos serviços executados | `itemOrdemService.podeLancarItem` |
| RN12 | Lançar item cria a SAÍDA de estoque na mesma transação | `lancarItem` |
| RN13 | Valor unitário em branco assume o preço de tabela. Informado abaixo dela é desconto: até 10% o vendedor libera sozinho, acima disso exige `ADMINISTRADOR` | `validarAlcadaDesconto` |
| RN14 | Remover item devolve a quantidade ao estoque com uma ENTRADA de estorno | `removerItem` |
| RN15 | Itens não podem ser removidos de OS `FINALIZADO` ou `CANCELADO` | `removerItem` |
| RN16 | Um item só pode ser removido pela OS à qual pertence (proteção contra URL manipulada) | `removerItem` |

### 3.3 Financeiro

| # | Regra | Onde |
|---|---|---|
| RN17 | Ciclo de vida da conta: `ABERTA` → `PAGA` ou `ABERTA` → `CANCELADA`. Não volta atrás | `quitarConta`, `cancelarConta` |
| RN18 | Contas não são excluídas, são canceladas (rastreabilidade) | — |
| RN19 | `VENCIDA` é situação **derivada** (ABERTA + vencimento passado), não persistida | `situacaoExibicao` |
| RN20 | Faturar a OS encerra e gera a conta a receber na mesma transação. `FINALIZADO` só pela ação de faturamento, restrita à gerência | `ordemServicoService.faturarEEncerrar` |
| RN21 | Uma OS gera no máximo uma conta (`ordemId` é `@unique`); faturar de novo não duplica | `gerarContaDaOrdem` |
| RN22 | OS sem orçamento e sem peças não gera conta | `gerarContaDaOrdem` |
| RN23 | Vencimento montado no fuso local (mesma correção do defeito D01 do M3) | `parseDataLocal` |
| RN24 | Descrição mínima de 3 caracteres; valor obrigatório maior que zero; vencimento obrigatório | `validarDados` |

### 3.4 Controle de acesso (RF023)

`ADMINISTRADOR` passa em tudo. Os demais só nas rotas listadas:

| Rota | Perfis (além do administrador) |
|---|---|
| `/clientes`, `/equipamentos` | ATENDENTE |
| `/clientes/:id/excluir` | *(só administrador — UC RF004)* |
| `/ordens` (listar e consultar) | ATENDENTE, TECNICO, VENDEDOR |
| `/ordens/nova`, criar OS | ATENDENTE, TECNICO |
| status da OS (exceto encerrar), serviços executados | TECNICO |
| faturar e encerrar a OS | *(só administrador — liberação de faturamento)* |
| lançar orçamento | VENDEDOR |
| aprovar / rejeitar orçamento | ATENDENTE, VENDEDOR |
| `/produtos` e `/api/produtos` (consulta) | COMPRAS, VENDEDOR |
| cadastro e movimentação de estoque | COMPRAS |
| lançar/remover produto na OS | VENDEDOR |
| `/financeiro` e `/api/financeiro` | FINANCEIRO |
| `/usuarios` | *(só administrador)* |

A sidebar usa a mesma função (`temPermissao`) para esconder o que o perfil não
acessa — o menu nunca mostra um link que vai dar "acesso negado".

---

## 4. Arquivos entregues

| Arquivo | Ação |
|---|---|
| `src/middlewares/perfilMiddleware.js` | **novo** — `exigirPerfil(...)` e `temPermissao(...)` |
| `src/services/produtoService.js` | **novo** — CRUD e estoque |
| `src/services/itemOrdemService.js` | **novo** — produtos na OS |
| `src/services/financeiroService.js` | **novo** — contas a pagar/receber |
| `src/controllers/produtoWebController.js` | **novo** |
| `src/controllers/itemOrdemWebController.js` | **novo** |
| `src/controllers/financeiroWebController.js` | **novo** |
| `views/produtos/{listar,form,estoque}.ejs` | **novos** |
| `views/financeiro/{painel,form}.ejs` | **novos** |
| `prisma/schema.prisma` | **alterado** — enum `SituacaoConta`, models `ContaPagar` e `ContaReceber` |
| `prisma/migrations/` | **versionado** — migrations de MySQL (inicial + Módulo 4) |
| `src/controllers/{produtoController,financeiroController}.js` | **novos** — API REST |
| `src/routes/{produtoRoutes,financeiroRoutes}.js` | **novo/preenchido** — `/api/produtos` e `/api/financeiro` |
| `src/routes/webRoutes.js` | **alterado** — rotas novas + `exigirPerfil` em todas as rotas |
| `src/app.js` | **alterado** — flash `aviso` e `temPermissao` nas views |
| `src/services/ordemServicoService.js` | **alterado** — `atualizarStatus` em transação, gerando a conta |
| `src/controllers/ordemServicoWebController.js` | **alterado** — passa produtos e totais para a view |
| `views/ordens/detalhe.ejs` | **alterado** — formulário de lançamento e total em peças |
| `views/partials/sidebar.ejs` | **alterado** — menu por perfil + link do financeiro |
| `views/partials/alertas.ejs` | **alterado** — bloco de aviso |
| `public/css/style.css` | **alterado** — `.alert-aviso`, `.badge-amarelo` |
| `tests/unit/{produtoService,itemOrdemService,financeiroService}.test.js` | **novos** |
| `tests/unit/ordemServicoService.test.js` | **alterado** — mock de `$transaction` e casos da conta |
| `tests/integration/{perfis,estoque,financeiro,garantia}.test.js` | **novos** — ver seção 6.1 |
| `tests/helpers/{ambiente,fixture}.js`, `tests/globalSetup.js` | **novos** — banco isolado dos testes |

### API REST (V04)

Até a V03 o Módulo 4 só tinha telas. `src/routes/produtoRoutes.js` estava
montado em `/api/produtos` **vazio** — qualquer chamada devolvia 404 — e o
financeiro não tinha rota de API nenhuma. Como a seção 2.3 do documento cita
"serviços de API para comunicação entre o sistema e o banco de dados", e os
Módulos 1 e 2 já expõem `/api/clientes` e `/api/ordens`, o Módulo 4 ficava
fora do padrão do próprio projeto.

```
GET    /api/produtos                  lista (query: busca, inativos=1)
GET    /api/produtos/:id              detalhe
GET    /api/produtos/:id/movimentos   razão de estoque, com autor
POST   /api/produtos                  cadastra
PUT    /api/produtos/:id              atualiza (não mexe no saldo)
DELETE /api/produtos/:id              desativa (lógico)
POST   /api/produtos/:id/reativar     reativa
POST   /api/produtos/:id/movimentos   entrada ou saída

GET    /api/financeiro/resumo             totais em aberto
GET    /api/financeiro/:tipo              lista (query: situacao)
GET    /api/financeiro/:tipo/:id          detalhe
POST   /api/financeiro/:tipo              cadastra
PUT    /api/financeiro/:tipo/:id          edita (só conta ABERTA)
POST   /api/financeiro/:tipo/:id/quitar   dá baixa
POST   /api/financeiro/:tipo/:id/cancelar cancela
```

`:tipo` é `pagar` ou `receber`. A API usa **JWT** (`Authorization: Bearer`),
não sessão, e aplica os mesmos perfis das telas via `exigirPerfilApi` —
403 em JSON no lugar do redirect para o dashboard.

> **Defeito do Módulo 1 corrigido junto:** `authController.login` lia
> `req.body.email`, campo que não existe em `Usuario`. A rota `/api/auth/login`
> respondia sempre "Login e senha obrigatórios" — ou seja, era impossível obter
> um token, e toda a API era inalcançável. Passou a ler `login`, mantendo
> `email` como alternativa. Uma linha, sem mexer em mais nada do Módulo 1.

### Rotas novas

```
GET  /produtos                        listar (COMPRAS, VENDEDOR)
GET  /produtos/novo                   formulário
POST /produtos                        criar
GET  /produtos/:id/editar             formulário de edição
POST /produtos/:id                    atualizar
POST /produtos/:id/excluir            desativar
POST /produtos/:id/reativar           reativar
GET  /produtos/:id/estoque            saldo + histórico
POST /produtos/:id/estoque            registrar movimentação

POST /ordens/:id/itens                lançar produto na OS (VENDEDOR)
POST /ordens/:id/itens/:itemId/remover  remover e estornar

GET  /financeiro                      painel (FINANCEIRO)
GET  /financeiro/:tipo/nova           formulário  (:tipo = pagar | receber)
POST /financeiro/:tipo                criar
POST /financeiro/:tipo/:id/quitar     dar baixa
POST /financeiro/:tipo/:id/cancelar   cancelar
```

---

## 5. Como aplicar

Este módulo **exige alteração de schema** — é o primeiro que muda o banco.

A migration está versionada em
`prisma/migrations/20260817133444_modulo4_financeiro_estoque/`:

```cmd
npm run db:mysql:client
npm run db:mysql
npm run seed
npm run dev
```

Ela cria `contas_pagar` e `contas_receber` (com o enum `SituacaoConta`) e
adiciona três colunas opcionais: `clientes.bairro`,
`movimentos_estoque.usuarioId` e `quitadaPorId` nas duas tabelas de contas.
Nenhuma coluna existente muda de tipo, então não há risco para os dados já
gravados.

Depois disso, `npm run seed` cria os perfis e o usuário `admin`. Para avaliar o
sistema com dados, cadastre pelo fluxo normal ou use uma massa de demonstração
própria — este repositório **não** versiona banco pré-populado, só o seed
mínimo necessário para o primeiro login.

---

## 6. Testes executados

| Suíte | Comando | Resultado |
|---|---|---|
| Unitários | `npm run test:unit` | **135 testes passando** (eram 38) |
| Integração (rota, sessão, JWT e banco) | `npm run test:integration` | **94 testes passando** (eram 7) |
| Banco real (SQLite + Prisma de verdade) | navegação manual | fluxo completo validado |
| Regressão dos Módulos 1, 2 e 3 | incluída no E2E | sem quebras |
| Teste manual exploratório | navegador, um atendimento completo | ver seção 7 |

Cobertura dos novos casos E2E:

- **Cadastro de produtos:** preço com vírgula, nome duplicado, preço zero/vazio,
  nome curto, filtro de inativos, estoque inicial virando movimento.
- **Estoque:** entrada, saída, saldo conferido a cada passo, quantidade zero e
  fracionada, tipo inválido, saída acima do saldo com aviso e saldo negativo
  persistido, produto inativo, desativação lógica e reativação.
- **Produtos na OS:** bloqueio por status, preço de tabela vs. valor negociado,
  descrição do movimento apontando para a OS, total em peças, remoção com
  estorno, remoção cruzada bloqueada, OS finalizada sem botões.
- **Financeiro:** cadastro das duas contas, validações, quitação, tentativa de
  quitar duas vezes, cancelamento, filtro por situação, `VENCIDA` derivada,
  totais do resumo.
- **Conta automática:** geração ao encerrar a OS, descrição com OS e cliente,
  valor do orçamento, observações com o detalhamento, não duplicar ao reencerrar.
- **Perfis:** FINANCEIRO barrado em produtos, COMPRAS sem lançar item, VENDEDOR
  sem movimentar estoque, ATENDENTE sem usuários nem serviços, TECNICO sem
  produtos, ADMINISTRADOR em tudo, e o menu escondendo o que não é permitido.

> **Não testado:** MySQL. Os testes de integração rodam com Prisma real, mas em
> **SQLite**, que não valida `@db.Decimal`, tamanho de coluna nem os tipos
> nativos do MySQL. Rodar a suíte apontando `TEST_DATABASE_URL` para um MySQL
> vazio antes de fechar a entrega — em especial o `ordemId @unique` da
> `contas_receber` e o rollback da transação de encerramento da OS.

---

## 6.1 Testes de integração

Os testes unitários provam as regras dentro dos services, com o Prisma mockado.
O que eles **não** alcançam é o caminho real: rota, `sessaoMiddleware`,
`exigirPerfil`, transação e renderização. É isso que a suíte de integração
cobre, em `tests/integration/`:

| Arquivo | O que prova |
|---|---|
| `perfis.test.js` | matriz de acesso das 6 perfis; a tela não oferecer ação que o perfil não pode executar; e o bloqueio valer também para POST direto, não só para o botão escondido |
| `estoque.test.js` | saldo e razão conciliando a cada movimentação; saída acima do saldo com aviso; baixa e estorno pela OS; conta a pagar da compra na mesma transação |
| `financeiro.test.js` | conta a receber gerada no encerramento; o orçamento prevalecendo sobre a soma das peças; não duplicar ao reencerrar; ciclo ABERTA → PAGA/CANCELADA |
| `garantia.test.js` | RN01 a RN08 do Módulo 3 pela rota, incluindo a consulta pública sem login |

### Banco isolado

Os testes apagam e recriam tabelas, então **nunca** rodam no banco de
desenvolvimento. `tests/helpers/ambiente.js` aponta a conexão para
`prisma/test.db` e **aborta o processo** se a URL contiver `dev.db`. O
`tests/globalSetup.js` cria o schema com `prisma db push` antes da suíte.

Para rodar contra MySQL, basta apontar para um banco vazio:

```bash
TEST_DATABASE_URL="mysql://root:@localhost:3306/sga_ti_teste" npm run test:integration
```

> `tests/integration/auth.test.js` continua vermelho de propósito — decisão do
> Felipe. Por isso a prova da suíte é `npm run test:integration`, não `npm test`.

---

## 7. Teste manual e correções (V02)

Foi feito um atendimento completo no preview, trocando de usuário a cada etapa,
como no uso real: atendente cadastra cliente e equipamento e abre a OS →
vendedor lança e aprova o orçamento → vendedor lança as peças → compras cadastra
produto e regulariza o estoque negativo → técnico registra o serviço e encerra a
OS → financeiro recebe a conta gerada → cliente consulta pela tela pública.

O fluxo funcionou de ponta a ponta (a conta gerada veio com R$ 480,00, o valor do
orçamento, e não R$ 788,00 — a soma indevida com as peças). Cinco defeitos
apareceram no caminho:

| # | Defeito | Origem | Correção |
|---|---|---|---|
| D01 | A tela oferecia ações que o perfil não pode executar. A atendente preenchia o orçamento, clicava em salvar, levava "acesso negado", voltava para o dashboard e **perdia o que digitou**. O mesmo valia para o seletor de status, o registro de serviço e o lançamento de peças | Módulo 4 | as views passaram a usar a mesma função `temPermissao` do middleware. Cada bloco só aparece para o perfil que pode usá-lo, e quem não pode lê uma frase dizendo de quem é a atribuição |
| D02 | Numa OS `AUTORIZADO`, a tela mostrava "Nenhum orçamento registrado" e, logo abaixo, o box verde "Orçamento aprovado — R$ 480,00" | Módulo 3 | a condição do bloco testava o status em vez de testar se existe orçamento. Agora a mensagem de "nenhum orçamento" só sai quando `valorOrcamento` é nulo |
| D03 | Quando o cadastro de produto voltava com erro de validação, o campo de preço vinha preenchido com **`NaN`** — `Number('31,50')` não é número — e o usuário tinha que digitar tudo de novo | Módulo 4 | a view devolve o texto original quando ele não é numérico |
| D04 | O valor do orçamento aparecia duas vezes na OS em `ORCAMENTO`, em duas linhas seguidas com formatação diferente | Módulo 4 (efeito do D01) | removida a linha repetida do bloco de aprovação |
| D05 | O saldo era gravado como um número calculado a partir de uma leitura feita **antes** da transação. Duas saídas simultâneas do mesmo produto leriam o mesmo saldo e a segunda escrita apagaria a primeira (*lost update*) | Módulo 4 | o saldo passou a ser ajustado com `{ increment }` / `{ decrement }`, deixando a aritmética com o banco. O `fakePrisma` do sandbox ganhou suporte a esses operadores para continuar refletindo o comportamento real |

### Defeito encontrado fora do escopo do Módulo 4

Durante o percurso apareceu um defeito **do Módulo 1** que não foi corrigido aqui
por estar fora do escopo, mas que vai quebrar em produção:

> `views/clientes/form.ejs` tem um campo `bairro` que **não existe** no model
> `Cliente`. Como `clienteService.atualizarCliente` repassa o `req.body` inteiro
> para o `prisma.cliente.update`, editar um cliente no MySQL vai falhar com
> `Unknown argument 'bairro'`. No sandbox isso passa despercebido porque o Prisma
> falso ignora campos desconhecidos.
>
> Correção sugerida: ou adicionar `bairro String?` ao model, ou montar o `data`
> campo a campo no service, como o `criarCliente` já faz.

---

## 7.2 Complementos da V04

Três lacunas que apareceram ao cruzar o código com o documento do TCC:

| Item | O que passou a existir |
|---|---|
| **API REST** | produtos e financeiro expostos em `/api`, com JWT e os mesmos perfis das telas (ver seção 4) |
| **Liberação de desconto** | A entrevista (item 8) e a seção 2.3.2 atribuem à Gerência/ADM a "liberação de desconto". O vendedor negocia até **10%** abaixo do preço de tabela; além disso, o lançamento é recusado com o valor mínimo na mensagem, e só passa com perfil `ADMINISTRADOR`. Sem valor informado, vale a tabela e a alçada nem entra |
| **Liberação de faturamento** | Encerrar a OS é o ato que gera a conta a receber — ou seja, faturar. `FINALIZADO` saiu do seletor de status e virou a ação **"Faturar e Encerrar"**, restrita ao administrador. O técnico continua movendo os demais status |
| **Dashboard** | Os quatro cartões eram zeros fixos no HTML e a tabela dizia "Nenhuma ordem de serviço cadastrada" mesmo com o banco cheio. Agora consultam o banco: OS abertas, aguardando orçamento, em andamento, finalizadas no mês, e as 5 OS mais recentes. Os links respeitam o perfil |

> **Impacto no Módulo 3:** o técnico não encerra mais a OS sozinho. É a única
> mudança de fluxo em cima do que o Felipe entregou, e vem direto da entrevista.
> Se a dupla preferir manter o encerramento com o técnico, é só trocar o perfil
> da rota `/ordens/:id/faturar` em `webRoutes.js`.

---

## 7.1 Complementos da V03

Fechando as pendências que faltavam do módulo, sem tocar na lógica dos
Módulos 1 e 2:

| Item | O que passou a existir |
|---|---|
| **P03 — conta a pagar na compra** | Na tela de estoque, uma ENTRADA pode marcar *"Lançar a conta a pagar desta compra no financeiro"* e informar valor, vencimento e fornecedor. A conta entra na **mesma transação** da movimentação: ou as duas coisas acontecem, ou nenhuma. O bloco só aparece em ENTRADA — não existe conta a pagar de uma baixa por perda — e os campos só ficam obrigatórios com a caixa marcada |
| **P04 — rastreabilidade** | `MovimentoEstoque.usuarioId`, `ContaPagar.quitadaPorId` e `ContaReceber.quitadaPorId`. O histórico de estoque ganhou a coluna "Registrado por" e o painel financeiro mostra "quitada em 12/08 **por Fábio Financeiro**". Todos opcionais, para não invalidar registros já existentes |
| **P01 — edição de conta** | Botão "Editar" nas contas ABERTAS. Conta PAGA ou CANCELADA continua imutável, com a mensagem explicando o caminho certo (cancelar e lançar de novo) — o histórico financeiro tem que refletir o que aconteceu |
| **P11 — filtro de busca** | Alternar "Mostrar inativos" preserva o termo digitado |
| **P10 — bug do `bairro`** | Ver abaixo |

### Correção do `bairro` (Módulo 1)

Mexendo no mínimo:

1. `clienteService.atualizarCliente` passou a montar o `data` **campo a campo**,
   como o `criarCliente` já fazia. Além de matar o erro, isso impede que um POST
   manipulado altere colunas que a tela não oferece.
2. `bairro String?` foi adicionado ao model `Cliente`. O formulário já coletava o
   campo desde o Módulo 1 e o valor era descartado em silêncio; agora ele é
   gravado. É uma coluna nova e opcional — nenhum código existente muda de
   comportamento.

Nenhum controller, rota ou view do Módulo 1 foi alterado.

### Migrations — resolvido nesta versão

Até aqui `prisma/migrations/` estava no `.gitignore` e continha migrations de
**SQLite**, geradas por um ambiente de desenvolvimento local. Ninguém conseguia
recriar o banco a partir do repositório.

O que mudou:

| Antes | Agora |
|---|---|
| `prisma/migrations/` ignorado, com SQL de SQLite | **versionado**, com SQL de MySQL e `migration_lock.toml` em `provider = "mysql"` |
| `prisma/schema.dev.prisma` e `prisma/dev.db` misturados com a entrega | movidos para fora de `prisma/`, num ambiente local não versionado |
| Módulo 4 sem migration aplicável | `20260817133444_modulo4_financeiro_estoque` versionada |

São duas migrations: `20260804231127_inicial` monta o schema dos Módulos 1 a 3 e
a do Módulo 4 aplica o delta. Ambas geradas pelo Prisma a partir do
`schema.prisma`, que continua sendo a fonte da verdade.

> **Combinar com o Felipe:** se ele já tem um banco MySQL criado à mão, precisa
> rodar `npx prisma migrate resolve --applied 20260804231127_inicial` uma vez,
> senão o Prisma vai tentar recriar tabelas que já existem.
>
> As migrations foram **geradas**, não aplicadas — nesta máquina não há MySQL.
> Rodar `npm run db:mysql` num banco de verdade é parte da homologação.

---

## 8. Pendências e limitações conhecidas

| # | Item | Prioridade |
|---|---|---|
| P01 | ~~Não há edição de conta depois de criada~~ — resolvido na V03 | — |
| P02 | Não há baixa parcial nem parcelamento de contas | baixa |
| P03 | ~~A conta a pagar não é gerada na entrada de estoque~~ — resolvido na V03 | — |
| P04 | ~~Não há registro de qual usuário quitou a conta ou movimentou o estoque~~ — resolvido na V03 | — |
| P05 | Não existe relatório de estoque mínimo / ponto de reposição | baixa |
| P06 | ~~Nenhuma rota valida o perfil do usuário~~ — resolvido na V01 | — |
| P09 | ~~Dashboard com contadores fixos em zero~~ — resolvido na V04 |
| P10 | ~~Campo `bairro` quebrava a edição de cliente~~ — resolvido na V03 | — |
| P11 | ~~O filtro de busca perde o termo ao alternar "Mostrar inativos"~~ — resolvido na V03 | — |
| P12 | A conta a receber gerada no encerramento não é cancelada se a OS for reaberta e cancelada depois | baixa |
| P07 | ~~RF012 (histórico de serviços por equipamento) continua sem tela própria~~ — resolvido na V02 do Módulo 5 | — |
| P08 | O link `/relatorios` da sidebar ainda é 404 — é o Módulo 5 | — |

---

## 9. Histórico de versões

| Versão | Data | Alterações | Responsável | Testes |
|---|---|---|---|---|
| V01 | 16/08/2026 | Produtos, estoque, produtos na OS, financeiro e controle de acesso por perfil | — | 114 unitários + 135 E2E |
| V02 | 17/08/2026 | Correção dos defeitos D01 a D05, encontrados em teste manual exploratório | — | 116 unitários + 151 E2E |
| V03 | 17/08/2026 | Conta a pagar na entrada de estoque, rastreabilidade de usuário, edição de conta e correção do `bairro` | — | 126 unitários + 67 integração |
| V04 | 25/08/2026 | API REST de produtos e financeiro, alçada de desconto, liberação de faturamento, dashboard com dados reais e migrations de MySQL versionadas | — | 135 unitários + 94 integração |
