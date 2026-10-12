# Plano e resultados de testes

**Referência:** seção 1.6 do documento do TCC
**Versão:** V01 · 12/10/2026
**Commit medido:** `ffadbf5`

Cobre os três tipos de teste previstos: **de software**, **de usabilidade** e
**nos navegadores**.

---

## 1. Testes de software

### 1.1 Resultado consolidado

| Suíte | Casos | Passando | Falhando |
|---|---|---|---|
| Unitários | 223 | 223 | 0 |
| Integração | 226 | 223 | **3** |
| **Total** | **449** | **446** | **3** |

As 3 falhas estão todas em `tests/integration/auth.test.js` e são anteriores a
toda esta fase de fechamento. Ver 1.5.

**Comandos:**

```cmd
npm run test:unit         :: 223 testes
npm run test:integration  :: 226 testes, 223 passando
npm test                  :: suíte completa — sai vermelho por causa do auth.test.js
```

### 1.2 Testes unitários — 223 casos

Exercitam a regra de negócio com o Prisma substituído por dublê. Não tocam
banco, rodam em cerca de 3 segundos.

| Arquivo | Casos | O que cobre |
|---|---|---|
| `produtoService.test.js` | 34 | Cadastro, preço, movimentação e saldo de estoque |
| `financeiroService.test.js` | 30 | Contas a pagar/receber, quitação, cancelamento |
| `itemOrdemService.test.js` | 29 | Peças na OS, baixa de estoque, valor negociado |
| `ordemServicoService.test.js` | 18 | Travas de status, validação do orçamento, fuso da previsão |
| `relatorioService.test.js` | 18 | Período, agregações dos quatro relatórios |
| `seguranca.test.js` | 18 | NF007 — produção × desenvolvimento de cada proteção |
| `servicoExecutadoService.test.js` | 16 | Garantia derivada, travas de registro e exclusão |
| `auditoriaExtensao.test.js` | 15 | NF005 — gravação automática, senha omitida, contexto |
| `backup.test.js` | 15 | NF006 — leitura da URL, nome do arquivo, argumentos |
| `csvService.test.js` | 12 | Separador, BOM, decimal com vírgula |
| `equipamentoService.test.js` | 10 | RF012 — histórico por equipamento, tipo |
| `clienteService.test.js` | 5 | Validações do cadastro |
| `authService.test.js` | 3 | Login e geração de token |

### 1.3 Testes de integração — 226 casos

Sobem a aplicação de verdade (rota, sessão, flash, views, JWT) contra um banco
isolado, recriado a cada suíte.

| Arquivo | Casos | O que cobre |
|---|---|---|
| `api.test.js` | 32 | API REST com JWT, inclusive a criação de usuário restrita ao admin |
| `auditoria.test.js` | 22 | NF005 — gravação automática, acesso, somente-leitura, filtros |
| `retencao.test.js` | 21 | NF008 — anonimização LGPD e exclusão lógica |
| `perfis.test.js` | 19 | RF022/RF023 — controle de acesso dos 6 perfis |
| `tiposServico.test.js` | 18 | RF017/RF019 — catálogo e classificação |
| `relatorios.test.js` | 17 | RF016/RF018 — relatórios por período |
| `dashboard.test.js` | 16 | Blocos por perfil e exportação CSV |
| `estoque.test.js` | 16 | RF014/RF015 — movimentações, saldo × razão |
| `financeiro.test.js` | 15 | RF020/RF021 — contas e a gerada no encerramento |
| `historicoEquipamento.test.js` | 14 | RF012 — histórico por equipamento |
| `garantia.test.js` | 13 | Serviços executados e garantia |
| `seguranca.test.js` | 13 | NF007 — cabeçalhos, cookie e CORS reais |
| `clientes.test.js` | 7 | API de clientes |
| `auth.test.js` | 3 | **As 3 falhas conhecidas** — ver 1.5 |

### 1.4 Onde os testes rodam

| Ambiente | Banco | Quando |
|---|---|---|
| Máquina de desenvolvimento | SQLite isolado (`prisma/test.db`) | A cada execução manual |
| **Integração contínua** | **MySQL 8** | **A cada push e pull request** |

O CI (`.github/workflows/ci.yml`) roda num MySQL 8 de serviço e produz os mesmos
números: **223 unitários e 223 de integração passando**. Isso importa porque o
SQLite não valida SQL gerado, migrations, tipos nativos, `ENUM`, constraints nem
`$transaction` real — tudo isso passou a ser verificado automaticamente.

O CI também roda `prisma migrate deploy` num banco vazio e um
`prisma migrate diff --exit-code` contra o schema: se alguém alterar o
`schema.prisma` sem gerar a migration, **o build quebra**.

`[PRINT: execução do CI no GitHub Actions, com todos os passos verdes]`

### 1.5 As 3 falhas conhecidas

`tests/integration/auth.test.js` falha nos seus 3 casos:

```
PrismaClientValidationError: Invalid `prisma.usuario.upsert()` invocation
  where: { email: "teste@sgati.com" }
                  ~~~~~
```

**Causa:** o arquivo foi escrito contra um schema que nunca existiu neste
projeto. O model `Usuario` não tem `email` nem um campo `perfil` em texto — tem
`login` e `perfilId`. A rota que ele testa **funciona**: o login pela API é
exercitado e passa em `api.test.js`.

**Consequência:** `npm test` sai vermelho sempre. Por isso a prova da suíte é
`npm run test:integration`.

**No CI**, o arquivo fica fora do passo bloqueante e roda num passo
`continue-on-error`: a falha continua visível, sem contaminar o resultado.

> `[VALIDAR: decisão da dupla.]` Corrigir para o schema real, remover, ou manter
> como está. Manter deixa a suíte permanentemente vermelha, o que é difícil de
> defender numa banca.

### 1.6 O que os testes **não** cobrem

Honestidade vale mais que número bonito. Não há cobertura automatizada de:

| # | Lacuna | Por quê |
|---|---|---|
| L01 | **Renderização das telas no navegador** | Os testes de integração leem o HTML da resposta, não executam CSS nem JavaScript. Um botão invisível por CSS passaria |
| L02 | **Comportamento sob HTTPS real** | A lógica do NF007 está testada; o tráfego sob TLS de verdade não foi exercitado — não há ambiente com certificado |
| L03 | **Ciclo de backup e restauração** | Exige `mysqldump` e um MySQL no ar. Ver `docs/BACKUP.md`, seção 5 |
| L04 | **Carga e concorrência** | Nenhum teste de volume. O sistema nunca foi exercitado com dois usuários simultâneos |
| L05 | **Compatibilidade entre navegadores** | É a seção 3 deste documento, ainda não executada |

---

## 2. Testes de usabilidade

### 2.1 Instrumento

O questionário e o roteiro de tarefas estão no **Apêndice A**
(`docs/APENDICE-A-USABILIDADE.md`), pronto para aplicar. Baseia-se na escala
**SUS** adaptada, com perguntas específicas das telas reais do sistema.

### 2.2 Como será aplicado

| Etapa | Descrição | Tempo |
|---|---|---|
| 1 | Preparar o ambiente: sistema no ar, massa de demonstração, seis usuários criados | — |
| 2 | Identificação do participante (Parte 1) | 2 min |
| 3 | **Roteiro de tarefas observadas** (Parte 2), só o bloco do perfil dele | 20–30 min |
| 4 | Escala SUS (Parte 3) | 5 min |
| 5 | Perguntas por tela (Parte 4) | 10 min |
| 6 | Questões abertas (Parte 5) | 5 min |

**A ordem importa:** as tarefas vêm antes do questionário. Questionário
respondido sem uso mede impressão, não usabilidade.

### 2.3 Participantes

| # | Quem | Perfil | Bloco de tarefas |
|---|---|---|---|
| P1 | Consultor — proprietário da Lelo Informática | `ADMINISTRADOR` | C (7 tarefas) + D |
| P2 | Usuário de atendimento | `ATENDENTE` | A (6 tarefas) |
| P3 | Usuário técnico | `TECNICO` | B (6 tarefas) |

### 2.4 O que será medido

| Métrica | Como |
|---|---|
| **Pontuação SUS** | 0 a 100, pela fórmula padrão. Referência de média: 68 |
| **Taxa de conclusão** | Tarefas concluídas sem ajuda ÷ total |
| **Tempo por tarefa** | Cronometrado pelo aplicador |
| **Problemas por gravidade** | Alta (impede), média (atrapalha), baixa (incomoda) |

### 2.5 Resultados

> **Ainda não aplicado.** Preencher após as sessões.

| Participante | Perfil | SUS | Conclusão sem ajuda | Data |
|---|---|---|---|---|
| P1 | Administrador | | | |
| P2 | Atendente | | | |
| P3 | Técnico | | | |
| **Média** | | | | |

**Principais problemas encontrados:**

| # | Problema | Tela | Gravidade | Ação tomada |
|---|---|---|---|---|
| | | | | |
| | | | | |

`[VALIDAR: agendar as sessões com o consultor. É a atividade com maior
dependência externa de todo o fechamento — depende da agenda de terceiros.]`

---

## 3. Testes nos navegadores

### 3.1 Método

Para cada combinação de navegador e tela, verificar:

1. **Renderização** — layout íntegro, sem elemento sobreposto ou cortado;
2. **Função** — formulários enviam, filtros aplicam, confirmações aparecem;
3. **Console** — nenhum erro de JavaScript.

Preencher com: **OK** · **Falha** (descrever) · **—** (não aplicável ao perfil).

### 3.2 Navegadores

| # | Navegador | Versão | Sistema | Testado em |
|---|---|---|---|---|
| N1 | Google Chrome | | Windows 11 | ___/___/______ |
| N2 | Mozilla Firefox | | Windows 11 | ___/___/______ |
| N3 | Microsoft Edge | | Windows 11 | ___/___/______ |
| N4 | Chrome — Android | | Android | ___/___/______ |
| N5 | Safari — iOS | | iOS | ___/___/______ |

### 3.3 Matriz

> **Em branco de propósito.** Preencher ao executar.

| # | Tela | Chrome | Firefox | Edge | Chrome Android | Safari iOS |
|---|---|:-:|:-:|:-:|:-:|:-:|
| 1 | Login | | | | | |
| 2 | Dashboard — administrador | | | | | |
| 3 | Dashboard — técnico | | | | | |
| 4 | Lista de clientes | | | | | |
| 5 | Cadastro de cliente | | | | | |
| 6 | Lista de equipamentos | | | | | |
| 7 | Cadastro de equipamento | | | | | |
| 8 | **Histórico do equipamento** | | | | | |
| 9 | Lista de ordens de serviço | | | | | |
| 10 | Abertura de OS | | | | | |
| 11 | **Detalhe da OS** (a tela mais densa) | | | | | |
| 12 | Lista de produtos | | | | | |
| 13 | Estoque do produto | | | | | |
| 14 | Painel financeiro | | | | | |
| 15 | Lançamento de conta | | | | | |
| 16 | **Relatórios** | | | | | |
| 17 | Exportação CSV | | | | | |
| 18 | Tipos de serviço | | | | | |
| 19 | **Auditoria** | | | | | |
| 20 | Usuários | | | | | |
| 21 | **Consulta pública** | | | | | |

### 3.4 Pontos de atenção

Itens que têm maior chance de divergir entre navegadores — verificar com cuidado:

| # | O quê | Onde | Por quê |
|---|---|---|---|
| A1 | Campo `<input type="date">` | Orçamento, relatórios, auditoria, financeiro | Cada navegador desenha seu próprio seletor; o Safari historicamente diverge mais |
| A2 | Download do CSV | Relatórios | Nome do arquivo e codificação |
| A3 | `confirm()` nas exclusões | Clientes, produtos, serviços, anonimização | Alguns navegadores suprimem diálogos em certas condições |
| A4 | Menu lateral em tela estreita | Todas | O layout não foi projetado para celular — **ver L06 abaixo** |
| A5 | Tabela do detalhe da OS | Detalhe da OS | É a tabela mais larga do sistema |
| A6 | Emojis dos rótulos | Todas | Renderizam diferente por sistema operacional |

### 3.5 Limitação conhecida

| # | Limitação |
|---|---|
| L06 | **O sistema não foi projetado para telas de celular.** O CSS não tem breakpoints responsivos; o layout é de duas colunas fixas. As linhas N4 e N5 da matriz devem ser preenchidas registrando isso honestamente, não omitidas. Se o uso em celular for requisito, é trabalho futuro |

### 3.6 Resultados

> **Ainda não executado.** Preencher a matriz da seção 3.3.

**Resumo:** ____ de ____ combinações OK.

**Falhas encontradas:**

| # | Navegador | Tela | Descrição | Gravidade | Correção |
|---|---|---|---|---|---|
| | | | | | |

---

## 4. Situação geral

| Tipo de teste | Situação | Evidência |
|---|---|---|
| **Software — unitários** | ✅ Executado | 223 passando, a cada push |
| **Software — integração** | ✅ Executado | 223 passando em SQLite e em MySQL 8 |
| **Software — migrations** | ✅ Executado | CI aplica as 5 e confere contra o schema |
| **Usabilidade** | ⬜ Não executado | Instrumento pronto — Apêndice A |
| **Navegadores** | ⬜ Não executado | Matriz pronta — seção 3 |
| **Backup e restauração** | ⬜ Não executado | Roteiro pronto — `docs/BACKUP.md`, seção 5 |
| **Carga e concorrência** | ⬜ Fora de escopo | — |

As três atividades não executadas dependem de ação fora do código: agenda do
consultor, acesso a máquinas com outros navegadores, e um servidor MySQL
instalado.
