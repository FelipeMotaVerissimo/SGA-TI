# Como rodar o SGA TI

O sistema roda em **Node.js + Express + Prisma + MySQL**. Este documento cobre o
que está no repositório; basta ter o Node LTS e um MySQL Server.

---

## 1. Instalação

```cmd
npm install
```

Crie um arquivo `.env` na raiz (ele não vai para o repositório) com:

```
DATABASE_URL="mysql://usuario:senha@localhost:3306/sga_ti"
PORT=3000
JWT_SECRET=troque_esta_chave
SESSION_SECRET=troque_esta_chave
```

---

## 2. Banco de dados

Com o MySQL Server no ar e o banco `sga_ti` criado:

```cmd
npm run db:mysql:client
npm run db:mysql
npm run seed
```

- `db:mysql:client` gera o Prisma Client a partir de `prisma/schema.prisma`
- `db:mysql` aplica as migrations versionadas em `prisma/migrations/`
- `seed` cria os 6 perfis e o usuário `admin` (senha `admin123`)

As migrations são duas: `20260804231127_inicial` monta o schema dos Módulos 1 a 3,
e `20260817133444_modulo4_financeiro_estoque` acrescenta o Módulo 4 —
`contas_pagar`, `contas_receber` e as colunas `clientes.bairro`,
`movimentos_estoque.usuarioId` e `quitadaPorId`.

> Se você já tinha um banco criado à mão, antes das migrations serem
> versionadas, marque a primeira como aplicada para o Prisma não tentar recriar
> as tabelas:
>
> ```cmd
> npx prisma migrate resolve --applied 20260804231127_inicial
> npm run db:mysql
> ```

---

## 3. Subir o sistema

```cmd
npm run dev     :: com reload automático (nodemon)
npm start       :: sem reload
```

Acesse `http://localhost:3000` — login `admin`, senha `admin123`.

A consulta pública de OS fica em `http://localhost:3000/consulta` e **não pede login**.

---

## 4. Testes

```cmd
npm run test:unit         :: 135 testes unitários (regras de negócio, Prisma mockado)
npm run test:integration  :: 94 testes de integração (rota, sessão, JWT e banco)
npm test                  :: suíte completa
```

### Banco dos testes

Os testes de integração apagam e recriam tabelas, então **nunca** usam o banco de
trabalho. `tests/helpers/ambiente.js` direciona a conexão para um banco separado e
**aborta** se a URL apontar para um banco de desenvolvimento. O schema é criado
automaticamente antes da suíte (`tests/globalSetup.js`).

Para rodar contra MySQL, aponte para um banco vazio:

```cmd
set TEST_DATABASE_URL=mysql://usuario:senha@localhost:3306/sga_ti_teste
npm run test:integration
```

### Suítes

| Arquivo | Cobre |
|---|---|
| `tests/unit/` | regras dos services: orçamento, garantia, estoque, itens da OS, financeiro |
| `tests/integration/perfis.test.js` | controle de acesso dos 6 perfis (RF022/RF023) |
| `tests/integration/estoque.test.js` | movimentações, saldo x razão, peças na OS (RF014/RF015) |
| `tests/integration/financeiro.test.js` | contas a pagar/receber e a conta gerada no encerramento (RF020/RF021) |
| `tests/integration/garantia.test.js` | serviços executados e garantia (Módulo 3) |
| `tests/integration/api.test.js` | API REST de produtos e financeiro, com JWT (Módulo 4) |
| `tests/integration/clientes.test.js` | API de clientes (Módulo 1) |

> `tests/integration/auth.test.js` falha de propósito: foi escrito para um schema
> antigo, com `usuario.email` em vez de `login`. Por isso a prova da suíte é
> `npm run test:integration`, e não `npm test`.

---

## Pendências conhecidas de ambiente

- O `.env` não vai para o repositório (correto). Quem clonar precisa criar o seu,
  conforme o modelo da seção 1.
- As migrations nunca foram aplicadas num MySQL real — foram geradas a partir do
  schema. A validação da entrega precisa rodar `npm run db:mysql` num banco
  MySQL de verdade e conferir o resultado.
