# Como rodar o SGA TI

Existem três formas de rodar o projeto. As duas primeiras usam Prisma de verdade.

| Modo | Banco | Instalação | Para quê |
|---|---|---|---|
| **Desenvolvimento** | SQLite (arquivo) | nenhuma | rodar e desenvolver hoje |
| **Entrega** | MySQL | MySQL Server | é o alvo do TCC |
| **Preview** | nenhum (memória) | nenhuma | testes rápidos e capturas de tela |

---

## 1. Desenvolvimento — SQLite (recomendado agora)

Não precisa instalar banco nenhum. O Prisma cria um arquivo `prisma/dev.db`.

**Modo fácil:** dê dois cliques em `setup-dev.cmd`. Ele faz tudo e avisa se algo falhar.

**Modo manual:**

```cmd
npm install
npm run db:dev
npm run seed
npm run dev
```

Acesse `http://localhost:3000` — login `admin`, senha `admin123`.

Comandos úteis:

```cmd
npm run db:dev:studio    :: abre o Prisma Studio para ver as tabelas
npm run db:dev:reset     :: apaga e recria o banco do zero
npm run db:gerar         :: regera o schema.dev.prisma a partir do schema.prisma
```

### Como funciona

`prisma/schema.prisma` continua sendo o schema oficial, em MySQL, e **não é alterado**.
O script `sandbox/gerarSchemaDev.js` deriva dele um `prisma/schema.dev.prisma` para SQLite:

1. `provider` vira `sqlite` e a URL passa a ser `DEV_DATABASE_URL`
2. atributos nativos do MySQL (`@db.VarChar`, `@db.Text`, `@db.Char`, `@db.Decimal`) são removidos
3. o enum `StatusOS` vira `String` — o Prisma não suporta enum em SQLite

> Sempre que mexer no `schema.prisma`, rode `npm run db:gerar` (ou `npm run db:dev`, que já chama).
> Nunca edite o `schema.dev.prisma` à mão: ele é sobrescrito.

### O que muda em relação ao MySQL

O código da aplicação é **exatamente o mesmo** — no JavaScript o status sempre foi string
(`'AUTORIZADO'`, `'EM_ANDAMENTO'`). A diferença é que o SQLite não impede um valor inválido
no nível do banco, e não valida tamanho de coluna. Por isso a validação antes da entrega
precisa ser feita no MySQL.

---

## 2. Entrega — MySQL

Depois de instalar o MySQL Server, ajuste a linha `DATABASE_URL` no `.env` com o
usuário e a senha corretos e rode:

```cmd
npm run db:mysql:client
npm run db:mysql
npm run seed
npm run dev
```

Não é necessária nenhuma alteração de schema: o model `ServicoExecutado` do Módulo 3
já existe em `prisma/schema.prisma`.

---

## 3. Preview — sem banco

Sobe o app real com um Prisma falso em memória. Serve para testar rotas, regras e telas
sem tocar em banco nenhum. Detalhes em `sandbox/README.md`.

```cmd
npm run preview     :: http://localhost:3000
npm run test:e2e    :: 39 casos automatizados do Módulo 3 + regressão
```

---

## Testes

```cmd
npm run test:unit   :: 10 testes unitários (Jest) — passando
npm run test:e2e    :: 39 casos end-to-end do Módulo 3 — passando
npm test            :: suíte completa
```

> `npm run test:integration` está quebrado desde antes do Módulo 3: os testes usam
> `usuario.email`, campo que não existe no schema (o correto é `login`). Precisa ser
> corrigido junto com o Felipe.

---

## Pendências conhecidas de ambiente

- `prisma/migrations/` está no `.gitignore`. Para o TCC as migrations deveriam ser
  versionadas — sem elas ninguém recria o banco a partir do repositório. Combinar com o Felipe.
- O `.env` não vai para o repositório (correto). Quem clonar precisa criar o dele.
