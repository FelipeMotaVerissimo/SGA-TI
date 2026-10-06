# Como rodar o SGA TI

O sistema roda em **Node.js + Express 5 + Prisma + MySQL + EJS**. Este documento
cobre o que está no repositório, com os cinco módulos consolidados na `main`.
Basta ter o Node LTS e um MySQL Server.

---

## 1. Instalação

```cmd
npm install
```

---

## 2. Variáveis de ambiente

Crie um arquivo `.env` na raiz. Ele **não vai para o repositório** — cada pessoa
cria o seu.

```
DATABASE_URL="mysql://usuario:senha@localhost:3306/sga_ti"
PORT=3000
NODE_ENV=development
JWT_SECRET=troque_esta_chave
SESSION_SECRET=troque_esta_chave
CORS_ORIGINS=
```

> Em produção, `NODE_ENV=production` liga HSTS, redirecionamento HTTP→HTTPS,
> cookie `secure` e `trust proxy`. Em desenvolvimento tudo isso fica desligado
> de propósito, para o sistema continuar funcionando em `http://localhost`.
> Detalhes em `docs/SEGURANCA.md`.

| Variável | Quem lê | Obrigatória | Para que serve |
|---|---|---|---|
| `DATABASE_URL` | `prisma/schema.prisma` | sim | Conexão com o MySQL da aplicação |
| `PORT` | `server.js` | não (padrão 3000) | Porta HTTP |
| `NODE_ENV` | `src/app.js`, `src/config/seguranca.js`, `src/middlewares/errorHandler.js` | não | Em `production`, liga as proteções de transporte do NF007 e o tratador de erros deixa de expor o stack trace |
| `JWT_SECRET` | `src/controllers/authController.js` | sim | Assinatura do token das rotas de API (`/api/*`) |
| `SESSION_SECRET` | `src/app.js` | sim | Assinatura do cookie de sessão das telas web |
| `TEST_DATABASE_URL` | `tests/helpers/ambiente.js` | só nos testes | Banco **vazio e separado** para a suíte de integração (ver seção 6) |
| `CORS_ORIGINS` | `src/config/seguranca.js` | não | Origens autorizadas a chamar a API, separadas por vírgula. Vazio = nenhuma origem cruzada (NF007) |

> `JWT_SECRET` e `SESSION_SECRET` são chaves distintas de propósito: o site usa
> sessão com cookie (`express-session`) e a API usa token JWT. Comprometer uma
> não compromete a outra.

---

## 3. Banco de dados

Com o MySQL Server no ar e o banco `sga_ti` criado:

```cmd
npm run db:mysql:client
npm run db:mysql
npm run seed
```

| Comando | O que faz |
|---|---|
| `db:mysql:client` | Gera o Prisma Client a partir de `prisma/schema.prisma` |
| `db:mysql` | Aplica as migrations versionadas (`prisma migrate deploy`) |
| `seed` | Cria os 6 perfis e o usuário `admin` |
| `backup` | NF006 — gera um dump do MySQL em `./backups` (ver `docs/BACKUP.md`) |

### As cinco migrations

| Migration | O que acrescenta |
|---|---|
| `20260804231127_inicial` | Schema dos Módulos 1 a 3: perfis, usuários, clientes, equipamentos, ordens de serviço e serviços executados |
| `20260817133444_modulo4_financeiro_estoque` | Módulo 4: `produtos`, `movimentos_estoque`, `itens_ordem`, `contas_pagar`, `contas_receber`, e as colunas `clientes.bairro`, `movimentos_estoque.usuarioId` e `quitadaPorId` |
| `20260825120000_modulo5_relatorios` | Módulo 5: `tipos_servico`, `equipamentos.tipo` e `itens_ordem.criadoEm` |
| `20261005120000_nf005_auditoria` | NF005: `logs_auditoria` e o enum `AcaoAuditoria` |
| `20261006120000_nf008_retencao` | NF008: `equipamentos.ativo` e `clientes.anonimizadoEm` |

As três primeiras já foram aplicadas num servidor MySQL real, em banco vazio, com o
`prisma migrate diff` do resultado contra o schema voltando vazio. Detalhes em
`docs/LEIAME-MODULO5.md`, seção 8.1.

> Se você já tinha um banco criado à mão, antes de as migrations serem
> versionadas, marque a primeira como aplicada para o Prisma não tentar recriar
> as tabelas:
>
> ```cmd
> npx prisma migrate resolve --applied 20260804231127_inicial
> npm run db:mysql
> ```

---

## 4. Subir o sistema

```cmd
npm run dev     :: com reload automático (nodemon)
npm start       :: sem reload
```

Acesse `http://localhost:3000`.

A consulta pública de OS fica em `http://localhost:3000/consulta` e **não pede
login** — é a tela que o cliente usa para acompanhar o conserto pelo número da OS.

---

## 5. Usuários e perfis

### O que o seed cria

`npm run seed` cria os **6 perfis** e **um único usuário**:

| Login | Senha | Perfil |
|---|---|---|
| `admin` | `admin123` | `ADMINISTRADOR` |

O `ADMINISTRADOR` enxerga e executa tudo, então esse usuário basta para subir o
sistema e navegar. Ele **não** basta para testar o controle de acesso: o RF023 só
aparece quando se entra com um perfil restrito e se vê o menu encolher.

### Criando um usuário por perfil

Para exercitar cada perfil, entre como `admin` e use **⚙️ Usuários → + Novo
Usuário**, criando um para cada um dos perfis abaixo. A suíte de integração usa
exatamente esses seis logins (`tests/helpers/fixture.js`), então vale seguir a
mesma convenção:

| Login sugerido | Perfil | O que esse perfil pode fazer no sistema |
|---|---|---|
| `admin` | `ADMINISTRADOR` | Tudo. Único que exclui cliente, fatura OS, gerencia usuários, tipos de serviço, relatórios e **auditoria** |
| `atendente` | `ATENDENTE` | Clientes, equipamentos, abrir e consultar OS, registrar a resposta do cliente ao orçamento |
| `tecnico` | `TECNICO` | Mudar status da OS, registrar serviços executados e garantia, consultar histórico do equipamento |
| `vendedor` | `VENDEDOR` | Lançar orçamento, lançar peças na OS, consultar produtos e OS |
| `financeiro` | `FINANCEIRO` | Contas a pagar e a receber: criar, editar, quitar e cancelar |
| `compras` | `COMPRAS` | Cadastro de produtos e movimentação de estoque (RF015) |

> A regra de acesso está em `src/middlewares/perfilMiddleware.js` e é declarada
> rota a rota em `src/routes/webRoutes.js`. O `ADMINISTRADOR` passa em todas sem
> precisar ser listado.

**[VALIDAR: decidir se o `prisma/seed.js` deve passar a criar os seis usuários
automaticamente.]** Hoje ele cria só o `admin`, então quem clonar o repositório
precisa criar os outros cinco à mão antes de conseguir demonstrar o RF022/RF023.

---

## 6. Testes

```cmd
npm run test:unit         :: 223 testes unitários (regras de negócio, Prisma mockado)
npm run test:integration  :: 226 testes de integração (rota, sessão, JWT e banco)
npm test                  :: suíte completa
```

Resultado atual na `main` consolidada:

| Suíte | Passando | Falhando |
|---|---|---|
| Unitários | **223** | 0 |
| Integração | **223** | 3 (todas em `auth.test.js`, ver abaixo) |

### Banco dos testes

Os testes de integração apagam e recriam tabelas, então **nunca** usam o banco de
trabalho. `tests/helpers/ambiente.js` direciona a conexão para um banco separado e
**aborta** se a URL apontar para um banco de desenvolvimento. O schema é criado
automaticamente antes da suíte (`tests/globalSetup.js`), que escolhe o schema pelo
protocolo da URL — `file:` para SQLite, qualquer outro para MySQL.

Para rodar contra MySQL, aponte para um banco **vazio**:

```cmd
set TEST_DATABASE_URL=mysql://usuario:senha@localhost:3306/sga_ti_teste
npm run test:integration
```

### O que cada suíte cobre

| Arquivo | Cobre |
|---|---|
| `tests/unit/` | Regras dos services: orçamento, garantia, estoque, itens da OS, financeiro, relatórios, CSV e histórico do equipamento |
| `tests/integration/perfis.test.js` | Controle de acesso dos 6 perfis (RF022/RF023) |
| `tests/integration/estoque.test.js` | Movimentações, saldo × razão, peças na OS (RF014/RF015) |
| `tests/integration/financeiro.test.js` | Contas a pagar/receber e a conta gerada no encerramento (RF020/RF021) |
| `tests/integration/garantia.test.js` | Serviços executados e garantia (Módulo 3) |
| `tests/integration/historicoEquipamento.test.js` | Histórico de serviços por equipamento (RF012) |
| `tests/integration/api.test.js` | API REST de produtos e financeiro, com JWT (Módulo 4) |
| `tests/integration/relatorios.test.js` | Relatórios gerenciais por período (RF016/RF018) |
| `tests/integration/tiposServico.test.js` | Catálogo de tipos e classificação (RF017/RF019) |
| `tests/integration/dashboard.test.js` | Dashboards por perfil e exportação CSV (UC RF008) |
| `tests/integration/auditoria.test.js` | Log de auditoria, acesso e somente-leitura (NF005) |
| `tests/integration/seguranca.test.js` | Cabeçalhos, cookie e CORS (NF007) |
| `tests/integration/retencao.test.js` | Anonimização LGPD e exclusão lógica (NF008) |
| `tests/integration/clientes.test.js` | API de clientes (Módulo 1) |

### As 3 falhas conhecidas

`tests/integration/auth.test.js` falha nos seus 3 casos, e isso é anterior à
consolidação. Ele foi escrito contra um schema antigo:

```
PrismaClientValidationError: Invalid `prisma.usuario.upsert()` invocation
  where: { email: "teste@sgati.com" }
                  ~~~~~
```

O model `Usuario` não tem `email` nem um campo `perfil` em texto — tem `login` e
`perfilId`, relação com `Perfil`. Por isso a prova da suíte é
`npm run test:integration`, e não `npm test`, que sempre sai vermelho.

**[VALIDAR: decidir o destino do `auth.test.js`.]** As opções são corrigi-lo para
o schema real (o login via API já funciona e é exercitado por `api.test.js`),
removê-lo, ou mantê-lo vermelho. Manter deixa a suíte do TCC permanentemente
vermelha, o que é difícil de defender numa banca.

---

## 7. Pendências conhecidas de ambiente

- O `.env` não vai para o repositório (correto). Quem clonar precisa criar o seu,
  conforme a seção 2.
- Não há ainda integração contínua: a suíte roda só na máquina de quem
  desenvolve. Previsto para a fase de deploy.
