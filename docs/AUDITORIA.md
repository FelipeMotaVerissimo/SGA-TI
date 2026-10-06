# NF005 — Rastreabilidade (log de auditoria)

**Versão:** V01
**Data:** 05/10/2026
**Requisito:** NF005 — rastreabilidade das operações sobre os dados

---

## 1. O problema

Até aqui o sistema não registrava nada sobre quem fez o quê. Um orçamento
alterado, um produto excluído ou uma conta quitada não deixavam rastro além do
próprio efeito. Numa assistência com seis perfis operando o mesmo banco, isso
significa que não há como responder à pergunta mais básica de auditoria: **quem
mudou isto, e quando?**

---

## 2. A decisão de projeto

O requisito pede um middleware que grave o log "sem depender de o desenvolvedor
lembrar de chamar em cada controller". Isso descarta a abordagem óbvia — um
`registrarLog()` espalhado pelos services —, porque ela falha exatamente no dia
em que alguém esquece, e o esquecimento é invisível.

A gravação foi pendurada **no próprio Prisma Client**, por extensão. Toda escrita
de qualquer model passa pela extensão, inclusive as que acontecem dentro de
`$transaction`. Nenhum controller e nenhum service sabem que a auditoria existe.

```
controller → service → prisma (estendido) → ┬→ operação real
                                            └→ log de auditoria
```

### O obstáculo: o Prisma não conhece a requisição

A extensão intercepta a operação, mas não sabe **quem** a disparou — `req` não
existe naquela camada. Passar o usuário de controller em controller até o service
devolveria o acoplamento que o requisito quer evitar.

A solução é o `AsyncLocalStorage` do Node (`src/config/contextoRequisicao.js`):
um middleware abre um escopo por requisição, e qualquer código executado dentro
dela — por mais fundo que esteja na pilha de chamadas assíncronas — enxerga o
mesmo contexto.

| Camada | Arquivo | Papel |
|---|---|---|
| Contexto | `src/config/contextoRequisicao.js` | Guarda `{ usuarioId, ip }` da requisição em curso |
| Middleware | `src/middlewares/contextoMiddleware.js` | Abre o escopo; preenche o usuário a partir da **sessão** |
| Middleware | `src/middlewares/authMiddleware.js` | Completa o usuário a partir do **JWT**, nas rotas de API |
| Extensão | `src/services/auditoriaExtensao.js` | Intercepta as escritas e grava o log |
| Cliente | `src/config/database.js` | Exporta o cliente **já estendido** |
| Consulta | `src/services/auditoriaService.js` | Só leitura: lista, filtra e compara |
| Tela | `src/controllers/auditoriaWebController.js` + `views/auditoria/listar.ejs` | `/auditoria` |

Fora de uma requisição — seed, script, teste unitário — o contexto não existe e o
log é gravado **sem usuário**. Isso é informação verdadeira, não uma falha:
aquela alteração não veio de ninguém logado.

---

## 3. Modelo de dados

Tabela `logs_auditoria`, migration `20261005120000_nf005_auditoria`.

| Campo | Tipo | Nulo | Observação |
|---|---|---|---|
| `id` | `INT` | não | PK |
| `entidade` | `VARCHAR(60)` | não | Nome do model Prisma (`Cliente`, `OrdemServico`…) |
| `registroId` | `INT` | sim | Nulo quando a operação não atinge um registro único (`updateMany`) |
| `acao` | `ENUM AcaoAuditoria` | não | `LEITURA`, `INCLUSAO`, `ALTERACAO`, `EXCLUSAO` |
| `valorAnterior` | `TEXT` | sim | Estado antes, em JSON |
| `valorNovo` | `TEXT` | sim | Estado depois, em JSON |
| `ip` | `VARCHAR(45)` | sim | 45 acomoda IPv6 |
| `usuarioId` | `INT` | sim | FK → `usuarios.id`, `ON DELETE SET NULL` |
| `criadoEm` | `DATETIME(3)` | não | Padrão: agora |

Índices em `criadoEm`, `(entidade, registroId)` e `usuarioId` — os três caminhos
de consulta da tela.

**`usuarioId` é `SET NULL` de propósito:** o log precisa sobreviver à remoção do
usuário. Perde-se quem fez, nunca o registro de que foi feito.

---

## 4. Regras

| # | Regra | Por quê |
|---|---|---|
| RN01 | Só operações de **escrita** geram log automático (`create`, `update`, `upsert`, `delete` e as variantes `Many`) | Logar toda consulta multiplicaria o volume por ordens de grandeza sem acrescentar rastreabilidade de quem alterou o quê |
| RN02 | O model `LogAuditoria` **não se audita** | Sem isso, gravar um log dispararia a extensão de novo, em recursão infinita |
| RN03 | **`senha` nunca entra no log**, nem o hash — vira `[omitido]` | O log registra *que* a senha mudou, jamais qual é. O marcador fica no lugar porque sumir com o campo faria parecer que a senha não mudou |
| RN04 | O estado anterior só é buscado em operações de **registro único** | Em `updateMany` não há um "antes" único a registrar |
| RN05 | Falha ao gravar o log **nunca** propaga para a operação de negócio | Auditoria não pode derrubar atendimento no balcão |
| RN06 | A tela mostra **só o que mudou**, comparando anterior e novo | Numa alteração que muda o telefone, o gestor quer ver o telefone, não os quinze campos que vieram iguais no `data` |
| RN07 | Não existe rota de escrita em `/auditoria` | Um log que o operador pode editar não prova nada |

### Por que a gravação não usa `await`

Esta é a decisão menos óbvia do módulo, e foi **encontrada em teste**, não
prevista: os casos que passam por `$transaction` estouravam por timeout.

A causa: no SQLite a transação segura o lock de escrita; a inserção do log entra
na fila atrás dela; e a transação fica esperando o `await` do log, que espera a
transação. Deadlock.

Disparar a gravação sem `await` resolve — a transação fecha, libera o lock, e a
inserção segue. A contrapartida é que uma transação que sofra rollback pode
deixar registro de algo que não persistiu. Entre perder a operação e ter um log a
mais, o log a mais é o mal menor: ele registra a tentativa, que também é
informação de auditoria.

Para os testes, que precisam de determinismo, a extensão expõe
`aguardarGravacoes()`. Em produção ninguém chama.

---

## 5. A tela `/auditoria`

Acesso: **somente `ADMINISTRADOR`** (`exigirPerfil()` sem argumentos).

Só existe o verbo `GET`. Não há `POST`, `PUT` nem `DELETE` — a rota que não
existe é a que ninguém chama por engano, e é isso que sustenta a palavra
"rastreabilidade".

**Filtros:** período (padrão: últimos 30 dias), usuário, entidade e ação. O
período reaproveita o `resolverPeriodo` dos relatórios, que já resolve as duas
armadilhas de fuso do Módulo 5: data final valendo até 23:59:59 e datas montadas
no fuso local, não em UTC.

Os selects de usuário e entidade listam **só o que de fato aparece no log** —
oferecer todos os models e todos os usuários encheria o filtro de opções que não
devolvem nada.

**Limite de 200 registros por consulta**, com aviso explícito quando o período
tem mais do que isso. Esconder o truncamento faria o gestor achar que viu tudo.

---

## 6. Testes

| Suíte | Arquivo | Casos |
|---|---|---|
| Unitários | `tests/unit/auditoriaExtensao.test.js` | 15 |
| Integração | `tests/integration/auditoria.test.js` | 22 |

Cobertura dos pontos que importam:

- o log é gravado **pela operação normal do sistema**, sem nenhum controller
  chamar auditoria — cadastro e edição de cliente pela tela, registro de serviço
  na OS (que passa por `$transaction`) e criação de produto pela API;
- a identidade vem da **sessão** nas telas e do **JWT** na API;
- a senha não aparece no log em nenhum caminho;
- o log não se audita;
- a tela é inacessível aos cinco perfis não administrativos (302 para o
  dashboard) e a quem não tem sessão (302 para o login);
- `POST`, `PUT` e `DELETE` em `/auditoria` devolvem **404** e não alteram a
  contagem de registros;
- período invertido volta com aviso em vez de quebrar;
- falha ao gravar o log não derruba a operação de negócio.

---

## 7. Pendências e limitações

| # | Item | Prioridade |
|---|---|---|
| P01 | **`LEITURA` não é gravada automaticamente.** O valor existe no enum porque o requisito o prevê, mas registrar toda consulta multiplicaria o volume. Se a banca exigir rastro de leitura, o caminho é marcar explicitamente as telas que exibem dado pessoal — a de clientes, principalmente | média |
| P02 | **`req.ip` atrás de proxy reverso devolve o IP do proxy.** Em produção é preciso habilitar `trust proxy` no Express para que ele leia o `X-Forwarded-For`. Entra junto com o NF007 | média |
| P03 | **O log não guarda o login do usuário, só o `usuarioId`.** Se o usuário for removido, o `SET NULL` preserva o registro mas perde a identidade. Desnormalizar o login no próprio log resolveria | baixa |
| P04 | **Sem política de retenção.** A tabela cresce indefinidamente. O descarte entra no NF008 | baixa |
| P05 | **Custo por operação:** cada `update`/`delete` passou a fazer uma leitura extra (para capturar o estado anterior) e uma inserção. No volume de uma assistência técnica é irrelevante; registrado para não virar surpresa | baixa |
| P06 | Operações feitas **fora** do sistema (DBA no banco, script) não são auditadas. Rastreabilidade em nível de aplicação não substitui auditoria do SGBD | baixa |

---

## 8. Como validar

```cmd
npm run test:unit         :: inclui os 15 casos da extensão
npm run test:integration  :: inclui os 22 casos da auditoria
```

Na tela, com o sistema no ar:

1. entre como `admin` e cadastre um cliente;
2. edite esse cliente, mudando nome, cidade e telefone;
3. abra **📜 Auditoria**.

O esperado são duas linhas: a `INCLUSAO` com todos os campos preenchidos, e a
`ALTERACAO` mostrando **apenas os três campos que mudaram**, no formato
`antes → depois`. Ambas com o usuário `Administrador (admin)` e o IP.
