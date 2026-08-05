# Ambiente de preview (sandbox)

Esta pasta **não faz parte do sistema**. Ela existe para permitir rodar e testar o
SGA TI sem MySQL e sem Prisma — usada pelo assistente para validar o código a cada
alteração e para gerar as capturas de tela.

> Não subir para produção. Se preferir, adicione `sandbox/` ao `.gitignore`.

## Por que existe

O ambiente onde o assistente executa código não tem MySQL, não tem `sudo` e não
consegue baixar os *engines* do Prisma (o domínio `binaries.prisma.sh` está fora
da allowlist de rede). Sem os engines, `prisma generate`, `prisma migrate` e o
`PrismaClient` não funcionam ali.

A solução foi trocar **apenas** `src/config/database.js` por um Prisma falso em
memória. Todo o resto do app é o código real: rotas, controllers, services,
middlewares, sessão, flash e views EJS.

## Arquivos

| Arquivo | O que faz |
|---|---|
| `fakePrisma.js` | Implementa em memória o subconjunto da API do Prisma que o projeto usa: `findMany`, `findUnique`, `findFirst`, `create`, `update`, `upsert`, `delete`, `deleteMany`, `count`, `$transaction`, além de `where` aninhado, `include`, `select` e `orderBy`. |
| `seedDemo.js` | Massa de demonstração: 2 clientes, 4 equipamentos, 2 produtos e **uma OS para cada status** (INICIAL, ORCAMENTO, AUTORIZADO, EM_ANDAMENTO, FINALIZADO, CANCELADO), com serviços cobrindo garantia vigente, vencida e ausente. |
| `preview.js` | Sobe o app real na porta informada. `node sandbox/preview.js 3000` |
| `testeE2E.js` | 39 casos end-to-end via HTTP sobre as regras do Módulo 3 + regressão dos Módulos 1 e 2. `node sandbox/testeE2E.js` |
| `telas/` | Capturas em HTML das telas reais renderizadas (CSS embutido, abrem direto no navegador). |

## Como rodar

```cmd
npm install
node sandbox/preview.js 3000
```

Acesse `http://localhost:3000` — login `admin` / senha `admin123`.

Os dados são recriados do zero a cada inicialização e ficam só na memória.

## O que este ambiente valida e o que NÃO valida

**Valida:** rotas, controllers, services, regras de negócio, validações, sessão,
mensagens flash, renderização das views, fluxo entre telas e regressão dos módulos
anteriores.

**Não valida:** SQL gerado pelo Prisma, migrations, tipos nativos do MySQL
(`@db.VarChar`, `@db.Decimal`, `@db.Char`), constraints de unicidade e integridade
referencial no banco, e o comportamento real de `$transaction`.

Por isso o teste final continua sendo rodar com MySQL na sua máquina.
