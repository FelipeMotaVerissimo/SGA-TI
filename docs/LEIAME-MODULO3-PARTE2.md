# SGA TI — Módulo 3 (parte 2): Serviços Executados e Garantia

**Autor:** Endrik
**Branch:** `modulo3-servicos`
**Versão:** V01 — primeira proposta (pendente de teste local e homologação)
**Data:** 04/08/2026

---

## 1. Objetivo

Permitir que o técnico registre os serviços executados numa Ordem de Serviço e que o sistema
controle a garantia de cada serviço, exibindo a situação tanto na tela interna quanto na
consulta pública do cliente.

## 2. Regras de negócio implementadas

| # | Regra | Onde é aplicada |
|---|-------|-----------------|
| RN01 | Serviços só podem ser registrados quando a OS estiver `AUTORIZADO` ou `EM_ANDAMENTO` | `servicoExecutadoService.registrarServico` |
| RN02 | Ao registrar um serviço numa OS `AUTORIZADO`, o status passa para `EM_ANDAMENTO` | mesma função, dentro de `prisma.$transaction` |
| RN03 | A descrição é obrigatória e deve ter no mínimo 5 caracteres | `validarDados` |
| RN04 | `garantiaDias` é opcional, inteiro, entre 0 e 3650. `0` é normalizado para `null` (sem garantia) | `validarDados` |
| RN05 | A data-fim da garantia **não é persistida** — é derivada de `executadoEm + garantiaDias` | `calcularGarantia` |
| RN06 | A garantia vale até o **fim** do último dia coberto | `calcularGarantia` |
| RN07 | Serviços não podem ser excluídos de OS `FINALIZADO` ou `CANCELADO` (rastreabilidade) | `excluirServico` |
| RN08 | Um serviço só pode ser excluído pela OS à qual pertence (proteção contra URL manipulada) | `excluirServico` |

### Situações da garantia

| Situação | Condição | Exibição |
|---|---|---|
| `SEM_GARANTIA` | `garantiaDias` nulo ou 0 | badge cinza "Sem garantia" |
| `EM_GARANTIA` | `diasRestantes >= 0` | badge verde com dias restantes |
| `VENCIDA` | `diasRestantes < 0` | badge vermelho "Garantia vencida" |

> `diasRestantes = 0` significa **último dia de garantia** — ainda vigente.

---

## 3. Arquivos entregues

| Arquivo | Ação | Observação |
|---|---|---|
| `src/services/servicoExecutadoService.js` | **novo** | toda a regra de negócio |
| `src/controllers/servicoExecutadoWebController.js` | **novo** | padrão try/catch + flash + redirect |
| `src/controllers/ordemServicoWebController.js` | **alterado** | passa `servicos`, `podeRegistrarServico`, `podeExcluirServico` para as views |
| `src/routes/webRoutes.js` | **alterado** | 2 rotas novas |
| `views/ordens/detalhe.ejs` | **alterado** | formulário + tabela de serviços |
| `views/ordens/consulta-publica.ejs` | **alterado** | bloco de serviços e garantia para o cliente |
| `src/services/ordemServicoService.js` | **alterado (patch manual)** | ver seção 4 |

### Rotas novas

```
POST /ordens/:id/servicos                    → registrar serviço
POST /ordens/:id/servicos/:servicoId/excluir → excluir serviço
```

Ambas protegidas por `sessaoMiddleware`.

---

## 4. Patch manual em `src/services/ordemServicoService.js`

Só **uma linha** precisa ser adicionada. Localize a função `buscarOrdemPorNumero` e inclua
`servicos: true` no `include`:

```js
async function buscarOrdemPorNumero(numero) {
  const ordem = await prisma.ordemServico.findUnique({
    where: { numero },
    include: {
      equipamento: { include: { cliente: true } },
      servicos:    { orderBy: { executadoEm: 'desc' } },   // <-- ADICIONAR (Módulo 3 - parte 2)
    },
  });
  if (!ordem) throw Object.assign(new Error('Ordem de serviço não encontrada.'), { status: 404 });
  return ordem;
}
```

`buscarOrdemPorId` **já traz** `servicos: true` — não precisa mexer.

> **Não é preciso rodar `prisma migrate`.** O model `ServicoExecutado` e a relação
> `OrdemServico.servicos` já existem no schema do Felipe.

---

## 5. Como aplicar

```cmd
cd SGA-TI
git checkout -b modulo3-servicos
```

Copie os arquivos desta pasta preservando a estrutura (`src/...` e `views/...`), aplique o
patch da seção 4 e suba o servidor:

```cmd
npm start
```

---

## 6. Plano de testes

### 6.1 Testes de regra de negócio (RN01 / RN02)

| # | Cenário | Passos | Resultado esperado |
|---|---|---|---|
| T01 | OS `INICIAL` | abrir detalhe da OS | formulário **não aparece**; aviso amarelo explicando os status permitidos |
| T02 | OS `ORCAMENTO` | idem | mesmo comportamento do T01 |
| T03 | OS `AUTORIZADO` | registrar serviço "Troca da placa-mãe", garantia 90 | flash de sucesso; serviço na tabela; **status da OS vira `EM_ANDAMENTO`** |
| T04 | OS `EM_ANDAMENTO` | registrar segundo serviço | sucesso; status permanece `EM_ANDAMENTO` |
| T05 | OS `CANCELADO` | idem T01 | formulário oculto |
| T06 | OS `FINALIZADO` | idem T01 | formulário oculto; coluna "Ações" some da tabela |

### 6.2 Testes de validação (RN03 / RN04)

| # | Entrada | Resultado esperado |
|---|---|---|
| T07 | descrição vazia | HTML bloqueia (`required`); se burlado, flash "mínimo 5 caracteres" |
| T08 | descrição "abc" | flash de erro "pelo menos 5 caracteres" |
| T09 | garantia em branco | salva com `garantiaDias = null` → badge "Sem garantia" |
| T10 | garantia `0` | salva como `null` → "Sem garantia" |
| T11 | garantia `-5` | flash de erro |
| T12 | garantia `9999` | flash de erro (limite 3650) |
| T13 | garantia `90` | badge verde "✅ 90 dia(s)" |

### 6.3 Testes de cálculo de garantia (RN05 / RN06)

Já validados por execução isolada da função `calcularGarantia` — **8/8 casos passaram**:

| Cenário | Situação | Dias restantes |
|---|---|---|
| `garantiaDias` null | SEM_GARANTIA | — |
| `garantiaDias` 0 | SEM_GARANTIA | — |
| 90 dias, executado hoje | EM_GARANTIA | 90 |
| 90 dias, executado há 89 dias | EM_GARANTIA | 1 |
| 90 dias, executado há 90 dias | EM_GARANTIA | 0 (último dia) |
| 90 dias, executado há 91 dias | VENCIDA | 0 |
| 1 dia, executado hoje | EM_GARANTIA | 1 |
| 365 dias, executado há 100 dias | EM_GARANTIA | 265 |

Para reproduzir com dados antigos no banco, altere `executadoEm` direto no MySQL:

```sql
UPDATE servicos_executados SET executado_em = DATE_SUB(NOW(), INTERVAL 100 DAY) WHERE id = 1;
```

> Confirme o nome real da coluna com `DESCRIBE servicos_executados;` antes de rodar.

### 6.4 Testes de exclusão (RN07 / RN08)

| # | Cenário | Resultado esperado |
|---|---|---|
| T14 | excluir serviço de OS `EM_ANDAMENTO` | confirm → sucesso, some da tabela |
| T15 | excluir serviço de OS `FINALIZADO` | botão nem aparece; via POST direto → flash de erro |
| T16 | POST `/ordens/2/servicos/1/excluir` onde o serviço 1 é da OS 1 | flash "não pertence à ordem de serviço informada" |

### 6.5 Teste de consulta pública

| # | Cenário | Resultado esperado |
|---|---|---|
| T17 | consultar OS com serviços | bloco "🛠️ Serviços Executados" com descrição, data e badge de garantia |
| T18 | consultar OS sem serviços | bloco não aparece (tela igual à original) |
| T19 | consultar número inexistente | mensagem de erro; sem quebra |

### 6.6 Testes de regressão (não quebrar o Módulo 1/2 do Felipe)

- [ ] Login e logout continuam funcionando
- [ ] Dashboard carrega
- [ ] Listagem e abertura de OS funcionam
- [ ] Registrar / aprovar / rejeitar orçamento funcionam
- [ ] Atualização manual de status pelo seletor funciona
- [ ] Bloco "📦 Produtos Utilizados" continua renderizando
- [ ] Consulta pública com OS sem serviços exibe exatamente como antes

### 6.7 Testes já executados nesta entrega

- Sintaxe JS validada com `node --check` nos 3 arquivos JS — **OK**
- `calcularGarantia`: 8 cenários — **8/8 OK**
- `podeRegistrarServico`: 6 status — **6/6 OK**
- Renderização EJS em 6 cenários (com serviços, sem serviços, OS finalizada, consulta pública
  vazia/preenchida) — **6/6 OK**

**Ainda não testado:** integração real com MySQL e Prisma (`$transaction`, mudança automática
de status). Precisa ser validado na sua máquina antes de abrir o PR.

---

## 7. Pendências e limitações conhecidas

| # | Item | Prioridade |
|---|---|---|
| P01 | Não há edição de serviço — apenas registro e exclusão | baixa |
| P02 | Não há vínculo entre serviço executado e produto/peça utilizada | média |
| P03 | Não existe tela consolidada de "serviços em garantia" para a gestão | média |
| P04 | Não há registro de qual usuário executou o serviço (schema não tem `usuarioId` em `ServicoExecutado`) | média — exigiria migration |
| P05 | ~~Sem testes automatizados~~ — resolvido na V02 | — |
| P06 | Nenhuma rota valida o **perfil** do usuário: qualquer usuário logado lança orçamento e registra serviço | média |
| P07 | ~~RF012 (histórico de serviços por equipamento) não tem tela própria~~ — resolvido na V02 do Módulo 5 | — |

---

## 8. Correções de defeitos (V02)

Três defeitos encontrados em teste de mesa e corrigidos em `src/services/ordemServicoService.js`:

| # | Defeito | Correção |
|---|---------|----------|
| D01 | A previsão de entrega aparecia **um dia antes** do informado. `new Date('2026-08-20')` é lido como meia-noite **UTC** e, no fuso do Brasil, vira 19/08 | `parseDataLocal` monta a data campo a campo no fuso local; a view usa `formatarDataInput` em vez de `toISOString()` |
| D02 | Salvar o orçamento de novo devolvia a OS para `ORCAMENTO` e apagava a `dataAprovacao`, mesmo com serviços já registrados | `registrarOrcamento` só aceita OS `INICIAL` ou `ORCAMENTO` (`STATUS_PERMITE_ORCAMENTO`) e não sobrescreve mais a data de aprovação. `aprovarOrcamento`/`rejeitarOrcamento` exigem status `ORCAMENTO` |
| D03 | O valor do orçamento aceitava vazio, zero, negativo ou texto; e era possível aprovar uma OS sem orçamento via POST direto | `validarValorOrcamento` (obrigatório, numérico, > 0, aceita vírgula) + `aprovarOrcamento` exige valor registrado |

Como a edição do orçamento passou a ser bloqueada por status, a tela de detalhe agora esconde o
formulário quando a OS já saiu de `ORCAMENTO` e exibe um resumo com valor, previsão e data de
aprovação.

### Testes automatizados (resolve a P05)

| Arquivo | Cobertura |
|---|---|
| `tests/unit/ordemServicoService.test.js` | fuso da previsão, validação do valor, travas de status do orçamento e da aprovação |
| `tests/unit/servicoExecutadoService.test.js` | status que permitem registro, cálculo da garantia (incluindo o último dia e o vencimento), validações e travas de exclusão |

```cmd
npm run test:unit
```

> 38 testes unitários passando. `tests/integration/auth.test.js` falha desde antes desta entrega
> (foi escrito para um schema antigo, com `email`/`perfil` em vez de `login`/`perfilId`) —
> pendência do Módulo 1.

---

## 9. Histórico de versões

| Versão | Data | Alterações | Responsável | Testes |
|---|---|---|---|---|
| V01 | 04/08/2026 | Implementação inicial de serviços executados e controle de garantia | Endrik | unitários da garantia + renderização das views |
| V02 | 04/08/2026 | Correção dos defeitos D01, D02 e D03 do orçamento + testes unitários automatizados | Endrik | 38 testes unitários + fluxo completo validado no navegador |
