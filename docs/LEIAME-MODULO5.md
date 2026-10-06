# SGA TI — Módulo 5: Relatórios e Análise

**Branch:** `modulo5-relatorios` (a partir de `modulo4-financeiro`)
**Versão:** V01
**Data:** 25/08/2026

Cobre o Módulo 5 do cronograma (item 3.2 do documento): geração de relatórios
gerenciais e dashboards de acompanhamento.

---

## 1. Requisitos atendidos

| Requisito | Onde |
|---|---|
| RF016 — maiores clientes por período | `relatorioService.maioresClientes` |
| RF017 — serviços mais executados por período | `relatorioService.servicosMaisExecutados` |
| RF018 — produtos mais vendidos | `relatorioService.produtosMaisVendidos` |
| RF019 — serviços e produtos vendidos por tipo de equipamento | `relatorioService.porTipoDeEquipamento` |
| UC RF008 — Emitir Relatórios (período, filtros, exibido **ou exportado**) | tela `/relatorios` + exportação CSV |
| Dashboards de acompanhamento | blocos do `/dashboard`, por perfil |
| RF012 — histórico de serviços por equipamento (V02) | `equipamentoService.historicoDeServicos` + tela `/equipamentos/:id/historico` |

---

## 2. O que estava bloqueado antes de começar

Três dos quatro relatórios não tinham de onde tirar dado. Isso foi descoberto
cruzando o documento com o schema, **antes** de escrever qualquer código:

| Problema | Evidência | Solução |
|---|---|---|
| RF017 não tinha como agrupar | 6 serviços no banco davam 6 grupos de 1 — `descricao` é texto livre, e "Troca de tela", "troca da tela" e "Substituição da tela" seriam três serviços diferentes | model `TipoServico` (catálogo) + `ServicoExecutado.tipoServicoId` |
| RF019 pedia "por tipo de equipamento" | `Equipamento` só tinha marca e modelo. "Dell Inspiron" e "Dell PowerEdge" são notebook e servidor, e o banco não sabia | `Equipamento.tipo` (enum `TipoEquipamento`) |
| RF018 não tinha data da venda | `ItemOrdem` não tinha data própria: uma OS aberta em julho com peça lançada em agosto contaria como julho | `ItemOrdem.criadoEm` |

### Decisões de modelagem

| Campo | Escolha | Motivo |
|---|---|---|
| `ServicoExecutado.tipoServicoId` | **opcional** | Os serviços registrados antes do catálogo não têm tipo. Inventar um falsearia o relatório — eles aparecem como "Não classificado", com explicação na tela |
| `Equipamento.tipo` | **obrigatório, default `OUTRO`** | Aqui o inverso funciona: todo equipamento tem um tipo, e `OUTRO` é resposta honesta até alguém classificar. Os 6 equipamentos existentes viraram `OUTRO` sem quebrar nada |
| `descricao` do serviço | **mantida** | O tipo dá a granularidade do relatório; a descrição continua sendo o relato do técnico daquele caso |

---

## 3. Regras de negócio

| # | Regra | Onde |
|---|---|---|
| RN01 | Sem filtro, o período são os últimos 30 dias — contando hoje, por isso `-29` e não `-30`, senão a janela cobriria 31 dias e contrariaria o rótulo | `resolverPeriodo` |
| RN02 | A data final vale até **23:59:59.999**: um relatório "de 01/08 a 31/08" perderia o dia 31 inteiro | `parseDataLocal` |
| RN03 | Datas montadas no fuso local (mesma correção do defeito D01 do M3) | `parseDataLocal` |
| RN04 | Período invertido é recusado, e a tela volta ao padrão com aviso em vez de quebrar | `resolverPeriodo` |
| RN05 | **RF016:** OS `CANCELADO` não entra — orçamento recusado não é venda | `STATUS_FORA_DO_FATURAMENTO` |
| RN06 | **RF016:** o total mostra o orçado; a coluna "Já Aprovado" separa o que o cliente autorizou do que ainda é proposta | `maioresClientes` |
| RN07 | **RF016:** OS sem orçamento conta na quantidade, mas soma zero | `maioresClientes` |
| RN08 | **RF018:** o período usa a data do **lançamento da peça**, não a da OS | `produtosMaisVendidos` |
| RN09 | **RF018:** vale o valor negociado de cada lançamento, não o preço de tabela | `produtosMaisVendidos` |
| RN10 | **RF017:** serviço sem tipo vira "Não classificado", nunca é escondido | `servicosMaisExecutados` |
| RN11 | Tipo de serviço desativado some da escolha, mas o histórico do relatório não muda | `tipoServicoService.desativar` |
| RN12 | Cada bloco do dashboard só é **consultado** para quem pode vê-lo — não se carrega o caixa da empresa para o técnico | `authWebController.dashboard` |

### Por que a agregação é feita em JavaScript

Os relatórios buscam as linhas e agregam em memória, em vez de usar `groupBy`
do Prisma. Dois motivos, comentados no service:

- o que interessa somar é `quantidade * valorUnit`, e `groupBy` não soma
  expressão, só coluna;
- agrupar por campo de relação (o cliente está a duas tabelas da OS) exigiria
  SQL cru, que não roda igual em MySQL e SQLite.

No volume de uma assistência técnica isso é irrelevante. Se crescer, o caminho
é uma view no banco ou `$queryRaw` por dialeto.

---

## 4. Dashboards de acompanhamento

O dashboard passou a ter blocos por assunto, e cada um só aparece para o perfil
correspondente:

| Bloco | Quem vê | Indicadores |
|---|---|---|
| 📋 Ordens de Serviço | todos | abertas, aguardando orçamento, em andamento, finalizadas no mês, e as 5 mais recentes |
| 💰 Financeiro | FINANCEIRO | a receber, a pagar, saldo previsto, contas vencidas |
| 📦 Estoque | COMPRAS, VENDEDOR | produtos ativos, com saldo negativo, sem estoque, valor em estoque, e a lista curta **a regularizar** com link direto |
| 🛡️ Garantias | TECNICO | serviços em garantia vigente e vencendo em até 15 dias |

`ADMINISTRADOR` vê todos.

---

## 5. Exportação (UC RF008)

Botão **⭳ CSV** em cada relatório, respeitando o período da tela. Rota:

```
GET /relatorios/:relatorio/csv?de=AAAA-MM-DD&ate=AAAA-MM-DD
    :relatorio = clientes | produtos | servicos | equipamentos
```

CSV foi escolhido por abrir no Excel e no LibreOffice sem adicionar dependência
ao projeto. Três detalhes existem por causa do Excel em português:

- **separador `;`** — num locale pt-BR o Excel usa a vírgula como separador
  decimal, e um arquivo separado por vírgula abre tudo numa coluna só;
- **BOM no início** — sem ele o Excel lê como ANSI e "Serviço" vira "ServiÃ§o";
- **decimal com vírgula** — `379,80` e não `379.80`.

As colunas do CSV são declaradas junto com a busca (`EXPORTAVEIS`, no
controller), para o arquivo nunca divergir do que a tela mostra.

---

## 6. Arquivos entregues

| Arquivo | Ação |
|---|---|
| `src/services/relatorioService.js` | **novo** — os quatro relatórios e os indicadores |
| `src/services/tipoServicoService.js` | **novo** — catálogo do RF017 |
| `src/services/csvService.js` | **novo** — geração de CSV |
| `src/controllers/relatorioWebController.js` | **novo** — tela e exportação |
| `src/controllers/tipoServicoWebController.js` | **novo** |
| `views/relatorios/index.ejs` | **novo** |
| `views/tipos-servico/{listar,form}.ejs` | **novos** |
| `prisma/schema.prisma` | **alterado** — `TipoServico`, `TipoEquipamento`, `ItemOrdem.criadoEm` |
| `prisma/migrations/20260825120000_modulo5_relatorios/` | **novo** |
| `src/controllers/authWebController.js` | **alterado** — blocos do dashboard por perfil |
| `views/dashboard.ejs` | **alterado** — indicadores de financeiro, estoque e garantia |
| `src/services/equipamentoService.js` | **alterado** — `tipo` com validação |
| `src/services/servicoExecutadoService.js` | **alterado** — `tipoServicoId` opcional |
| `src/services/ordemServicoService.js` | **alterado** — inclui `tipoServico` nos serviços |
| `views/equipamentos/form.ejs`, `views/ordens/detalhe.ejs` | **alterados** — selects de tipo |
| `views/partials/sidebar.ejs` | **alterado** — link do catálogo |
| `tests/unit/{relatorioService,csvService}.test.js` | **novos** |
| `tests/integration/{relatorios,tiposServico,dashboard}.test.js` | **novos** |

---

## 7. Testes

| Suíte | Comando | Resultado |
|---|---|---|
| Unitários | `npm run test:unit` | **165 testes passando** |
| Integração (SQLite local) | `npm run test:integration` | **145 testes passando** |
| Integração (**MySQL real**) | `TEST_DATABASE_URL=... npm run test:integration` | **145 testes passando** — ver 8.1 |

> `tests/integration/auth.test.js` continua vermelho por decisão da dupla.
> Por isso a prova da suíte é `npm run test:integration`, não `npm test`.

---

## 8. Defeitos encontrados e corrigidos

| # | Defeito | Origem | Correção |
|---|---|---|---|
| D01 | O RF018 voltava **vazio**. A migration adicionou `criadoEm` com `DEFAULT CURRENT_TIMESTAMP`, que no SQLite grava **texto**, enquanto o Prisma espera inteiro em milissegundos. Comparar texto com número no SQLite dá sempre "maior": `gte` trazia tudo e `lte` não trazia nada | ambiente de desenvolvimento | o seed passou a gravar `criadoEm` explícito. No MySQL não acontece — `DATETIME(3)` é data de verdade. **Armadilha perigosa:** os testes passariam, porque gravam via Prisma no formato certo, enquanto os dados reais mentiriam |
| D02 | O nome do arquivo CSV dizia `a_2027-01-01` num relatório que terminava em 31/12. `toISOString()` converte para UTC e a data final, que vale até 23:59:59, virava o dia seguinte | Módulo 5 | nome montado campo a campo, no fuso local — mesma classe do defeito D01 do Módulo 3 |
| D03 | O BOM do CSV estava escrito como caractere literal no fonte: invisível no editor e some numa conversão de encoding sem ninguém perceber | Módulo 5 | passou a ser o escape `﻿` |
| D04 | Ao errar o cadastro de equipamento, o formulário voltava **sem explicação nenhuma**. O erro ia por `req.flash`, que só aparece na requisição seguinte | Módulo 1 | erro passado direto para a view. Mesma classe já corrigida em produtos e financeiro; só não tinha aparecido porque nada ali falhava na validação — agora falha, com o tipo inválido |
| D05 | Apontar `TEST_DATABASE_URL` para MySQL **não funcionava**: o `globalSetup` escolhia o schema pela existência do arquivo SQLite, e o Prisma recusava com "the URL must start with the protocol `file:`". O caminho MySQL documentado no COMO-RODAR estava quebrado | Módulo 5 | o schema passou a ser escolhido pelo protocolo da URL, não pelo arquivo. Descoberto justamente ao fazer a homologação em MySQL (seção 8.1) |

O `fakePrisma` do ambiente local também precisou aprender o model novo e ganhou
um `groupBy` mínimo, usado pela contagem de usos do catálogo.

---

## 8.1 Homologação em MySQL

Até aqui as migrations tinham sido **geradas** a partir do schema, mas nunca
**aplicadas** num servidor de verdade — o ambiente local só tem SQLite. Isso foi
fechado subindo um servidor MySQL temporário (MariaDB 11.4 portátil, que o
Prisma trata com o provider `mysql`) e rodando o ciclo completo:

| Verificação | Resultado |
|---|---|
| `prisma migrate deploy` com as 3 migrations, num banco vazio | as três aplicaram, em ordem, sem erro |
| `prisma migrate diff` do banco resultante contra o `schema.prisma` | **"This is an empty migration"** — o banco criado pelas migrations é exatamente o schema |
| `prisma migrate status` | "Database schema is up to date!" |
| `npm run seed` e a massa de demonstração | 12 tabelas populadas |
| Suíte completa apontando para o MySQL | **310 testes passando** (as 3 falhas conhecidas do `auth.test.js` continuam) |
| Sistema no ar contra o MySQL | `/dashboard`, `/relatorios`, `/produtos`, `/financeiro`, `/tipos-servico`, `/ordens` todos 200 |
| `{ decrement }` de estoque | 11 → 9, atômico |
| Transação do faturamento | OS para `FINALIZADO` **e** conta a receber de R$ 890,00 gerada juntas |
| `@db.Decimal(10,2)` | devolvido como Decimal, não como float |

Ou seja: o que o ambiente SQLite não conseguia validar — SQL gerado, migrations,
tipos nativos, ENUM, constraints e `$transaction` real — está verificado.

O servidor temporário foi removido depois; nada foi instalado na máquina.

---

## 9. Pendências e limitações conhecidas

| # | Item | Prioridade |
|---|---|---|
| P01 | A linha "Não classificado" do RF017 vai crescer conforme o técnico registrar serviço sem escolher tipo. Tornar o campo obrigatório para serviços **novos**, mantendo os antigos, resolveria — mas muda o fluxo do técnico | média |
| P02 | Exportação só em CSV. O documento diz "exibido ou exportado" e não exige PDF, mas a banca pode pedir | baixa |
| P03 | Os relatórios não têm paginação: mostram o top 10. Com muitos clientes, o gestor não consegue ver além disso pela tela (o CSV traz o mesmo limite) | baixa |
| P04 | Não há relatório de estoque mínimo / ponto de reposição — herdado do Módulo 4 | baixa |
| P05 | ~~As migrations foram geradas, nunca aplicadas num MySQL real~~ — **resolvido**, ver seção 8.1 | — |

---

## 10. Histórico de versões

| Versão | Data | Alterações | Testes |
|---|---|---|---|
| V01 | 25/08/2026 | Modelagem (catálogo de tipos, tipo de equipamento, data do item), os quatro relatórios, dashboards por perfil e exportação CSV | 165 unitários + 145 integração |
| V02 | 27/08/2026 | RF012 — tela de histórico de serviços por equipamento, fechando a pendência P07 dos Módulos 3 e 4 | 175 unitários + 159 integração |

---

## 11. RF012 — Histórico de serviços por equipamento (V02)

Era a pendência **P07**, aberta no Módulo 3 parte 2 e repetida no Módulo 4: o
requisito existia no documento, mas nunca teve tela. O histórico só podia ser
lido abrindo uma OS de cada vez — para saber se uma peça já tinha sido trocada,
o atendente comparava de cabeça.

**Rota:** `GET /equipamentos/:id/historico`

### Granularidade

Uma linha por **serviço executado**, reunindo todas as OS do equipamento. A
pergunta do balcão é "o que já foi feito nesta máquina?", não "quais OS ela
teve" — por isso o serviço é a unidade, e não a ordem. As OS aparecem numa
segunda tabela, como contexto.

### Regras de negócio

| # | Regra | Motivo |
|---|---|---|
| RN01 | A lista é ordenada pela data de execução, mais recente primeiro, **atravessando as OS** | A ordem cronológica do equipamento é o que interessa; agrupar por OS devolveria o problema que a tela veio resolver |
| RN02 | Serviço de OS `CANCELADO` **continua** no histórico, com o status da OS na linha | Ele foi mesmo executado na máquina. Esconder falsearia o histórico técnico; mostrar sem o status esconderia o contexto. É a mesma leitura do indicador de garantias do dashboard, que também não filtra por status |
| RN03 | A garantia é derivada por `calcularGarantia`, a mesma função da tela da OS | Reimplementar o cálculo faria as duas telas discordarem sobre a mesma garantia (RN05/RN06 do Módulo 3) |

### Acesso (RF023)

`ATENDENTE` e `TECNICO`, além do `ADMINISTRADOR`. O técnico é justamente quem
precisa saber o que já foi feito antes de mexer — e chega à tela pelo link no
detalhe da OS, já que a lista de equipamentos é do atendente.

Como o técnico não acessa `/equipamentos`, o botão "voltar" muda de destino
conforme o perfil. Sem isso, o link de saída jogaria o técnico direto num
"acesso negado".

### O que a tela mostra

- identificação do equipamento (código, tipo, série, cliente, defeito do cadastro);
- quatro indicadores: OS, serviços executados, **em garantia vigente** e último atendimento;
- aviso destacado quando há garantia vigente — é o retrabalho que não se cobra duas vezes;
- a lista de serviços, com tipo, garantia e situação, e link para a OS de origem;
- as OS do equipamento, com quantidade de serviços de cada uma.

### Arquivos

| Arquivo | Ação |
|---|---|
| `src/services/equipamentoService.js` | **alterado** — `historicoDeServicos` |
| `src/controllers/equipamentoWebController.js` | **alterado** — `exibirHistorico` |
| `src/routes/webRoutes.js` | **alterado** — a rota, com `exigirPerfil('ATENDENTE', 'TECNICO')` |
| `views/equipamentos/historico.ejs` | **novo** |
| `views/equipamentos/listar.ejs`, `views/ordens/detalhe.ejs` | **alterados** — links de entrada |
| `tests/unit/equipamentoService.test.js` | **novo** — 10 testes |
| `tests/integration/historicoEquipamento.test.js` | **novo** — 14 testes |

### Como validar

```cmd
npm run test:unit             :: 175 testes
npm run test:integration      :: 159 testes (as 3 falhas do auth.test.js seguem intencionais)
```

Na tela, com a massa de demonstração: o equipamento **EQ-0003 (Lenovo
ThinkPad T480)** é o caso que justifica o requisito — tem uma OS `INICIAL`
aberta agora e uma OS `FINALIZADO` de julho cujo serviço ainda está **em
garantia por 147 dias**. Antes desta tela, quem abrisse a OS nova não teria
como saber disso sem procurar OS por OS.
