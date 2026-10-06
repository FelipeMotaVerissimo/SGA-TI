# Deploy e integração contínua

**Versão:** V01
**Data:** 06/10/2026

---

## 1. Integração contínua

**Arquivo:** `.github/workflows/ci.yml`
**Dispara em:** todo `push` e todo `pull request`, em qualquer branch.

### O que o CI faz

| Passo | Por quê |
|---|---|
| `npm ci` | Instala exatamente o que está no `package-lock.json` |
| `prisma generate` | Gera o client a partir do schema de **MySQL**, não do de desenvolvimento |
| `prisma migrate deploy` | Aplica as 5 migrations num MySQL 8 vazio |
| `prisma migrate diff --exit-code` | **Falha o build** se o banco criado pelas migrations divergir do `schema.prisma` |
| `npm run seed` | Prova que o seed roda num banco recém-migrado |
| `npm run test:unit` | 223 testes |
| Testes de integração | 223 testes, contra o MySQL do CI |
| `auth.test.js` isolado | Não bloqueia — ver abaixo |

### O ganho que isso traz

Até aqui a suíte de integração rodava em **SQLite** na máquina de quem
desenvolve. O que o SQLite não consegue validar — SQL gerado, migrations, tipos
nativos, `ENUM`, constraints e `$transaction` de verdade — dependia de
homologação manual, feita uma única vez no Módulo 5 com um MariaDB portátil.

Com o CI, **isso passa a acontecer a cada push**, num MySQL 8 de serviço. E o
passo do `migrate diff` fecha uma classe inteira de defeito: alguém alterar o
`schema.prisma` e esquecer de gerar a migration deixa de ser algo que só se
descobre na hora de subir para produção.

### Sobre o `auth.test.js`

Ele falha nos seus 3 casos desde antes desta suíte existir, por ter sido escrito
contra um schema antigo que usava `usuario.email` (ver `docs/DIVERGENCIAS-DOC.md`,
defeito D06). Enquanto ele estiver no caminho padrão, `npm test` sai vermelho e
**um CI vermelho não significa nada** — ninguém olha para um indicador que vive
quebrado.

A solução adotada: o passo bloqueante exclui esse arquivo, e um passo seguinte,
marcado `continue-on-error`, roda só ele. A falha continua visível no log, sem
contaminar o resultado.

> `[VALIDAR: decisão da dupla sobre o destino do arquivo.]` Corrigir para o
> schema real, remover, ou manter. A exclusão no CI é um contorno, não a
> resposta.

---

## 2. Escolha da plataforma

> **O documento do TCC promete Render, Railway ou Fly.io com MySQL gerenciado.
> Em outubro de 2026 nenhuma das três entrega as duas coisas de graça.** Foi
> preciso verificar antes de recomendar, e a verificação mudou a resposta.

| Plataforma | Hospedagem gratuita | MySQL gerenciado gratuito |
|---|---|---|
| **Render** | Sim — sem cartão de crédito; o serviço hiberna após 15 min sem acesso, com 30–60 s de retomada | **Não.** O banco gratuito é PostgreSQL |
| **Railway** | **Não.** O plano gratuito permanente acabou; hoje é crédito de teste | Sim, mas pago |
| **Fly.io** | **Não** para contas novas: exige cartão e dá apenas um teste limitado | Não oferece MySQL gerenciado |

### Decisão: Render (aplicação) + Aiven (banco)

- **Render** hospeda a aplicação. É o único dos três com plano gratuito real e
  sem cartão de crédito, e faz deploy contínuo a partir do GitHub, que é o que o
  documento promete.
- **Aiven** hospeda o MySQL. O plano gratuito é de 1 GB, sem cartão de crédito e
  sem prazo de validade. É o único MySQL gerenciado verdadeiramente gratuito que
  encontrei disponível hoje.

**Por que não trocar para PostgreSQL e usar só o Render?** Porque o
`schema.prisma` inteiro está escrito para MySQL, com `@db.VarChar`, `@db.Decimal`
e `ENUM` nativo, e as 5 migrations são SQL de MySQL. Trocar o SGBD às vésperas da
entrega refaria a modelagem, o DER e toda a homologação por um ganho de
conveniência. O documento diz MySQL, o sistema é MySQL, e separar aplicação de
banco é arquitetura normal — não um remendo.

`[VALIDAR: planos gratuitos mudam rápido. Conferir Render e Aiven antes da
apresentação; se algum tiver mudado, a alternativa mais próxima é o TiDB Cloud
Serverless, que é compatível com MySQL e tem camada gratuita maior.]`

---

## 3. Passo a passo

### 3.1 Banco no Aiven

1. Criar conta em `aiven.io` e escolher **MySQL**, plano **Free**.
2. Aguardar o provisionamento (alguns minutos) e copiar a **Service URI**, no
   formato:

   ```
   mysql://avnadmin:SENHA@sga-ti-xxxx.aivencloud.com:12345/defaultdb?ssl-mode=REQUIRED
   ```

3. O Aiven exige TLS. O Prisma aceita o parâmetro na própria URL; se a conexão
   for recusada, troque por `?sslaccept=accept_invalid_certs` apenas para
   diagnosticar, **nunca** como configuração final.

### 3.2 Aplicação no Render

1. Em `render.com`, **New → Blueprint**, apontando para o repositório. O Render
   lê o `render.yaml` da raiz.
2. Informar as variáveis marcadas como `sync: false`:

   | Variável | Valor |
   |---|---|
   | `DATABASE_URL` | a Service URI do Aiven |
   | `CORS_ORIGINS` | vazio, enquanto não houver front separado |

   `SESSION_SECRET` e `JWT_SECRET` são **geradas pelo próprio Render**
   (`generateValue: true`) e não passam por lugar nenhum.

3. O deploy roda o build, que inclui `prisma migrate deploy`. Acompanhar o log:
   as 5 migrations devem aplicar em ordem.

### 3.3 Primeiro usuário

O `npm run seed` não roda automaticamente — criar usuário é operação deliberada,
não efeito colateral de deploy. O plano gratuito do Render não dá shell, então a
forma mais simples é rodar o seed da sua máquina, apontando para o banco de
produção:

```cmd
set DATABASE_URL=mysql://avnadmin:SENHA@sga-ti-xxxx.aivencloud.com:12345/defaultdb?ssl-mode=REQUIRED
npm run seed
```

Isso cria os 6 perfis e o usuário `admin` / `admin123`.

> **Trocar a senha do `admin` imediatamente após o primeiro acesso.** Ela está
> escrita neste documento, no `prisma/seed.js` e no `COMO-RODAR.md` — ou seja, é
> pública.

---

## 4. Variáveis de ambiente em produção

| Variável | Origem | Observação |
|---|---|---|
| `NODE_ENV=production` | `render.yaml` | Liga HSTS, redirecionamento HTTPS, cookie `secure` e `trust proxy` (NF007) |
| `PORT=10000` | `render.yaml` | Porta esperada pelo Render no plano free |
| `DATABASE_URL` | painel do Render | A URI do Aiven, com TLS |
| `SESSION_SECRET` | gerada pelo Render | — |
| `JWT_SECRET` | gerada pelo Render | — |
| `CORS_ORIGINS` | painel do Render | Vazio = nenhuma origem cruzada |

**Nenhum segredo real está no repositório.** O `render.yaml` só declara os nomes.

---

## 5. Migrations em produção

```
npx prisma migrate deploy --schema prisma/schema.prisma
```

Roda no `buildCommand`, a cada deploy. É **idempotente**: aplica apenas o que
falta, então repetir não causa dano.

`migrate deploy` é o comando correto para produção — diferente de `migrate dev`,
ele nunca recria o banco, nunca pede confirmação e nunca gera migration nova.

### Se o banco já existia antes das migrations serem versionadas

```cmd
npx prisma migrate resolve --applied 20260804231127_inicial
npx prisma migrate deploy
```

---

## 6. Limitações conhecidas do ambiente gratuito

| # | Limitação | Impacto na apresentação |
|---|---|---|
| L01 | O serviço do Render **hiberna** após 15 min sem acesso | O primeiro acesso leva 30–60 s. **Abrir o sistema alguns minutos antes da defesa** |
| L02 | O MySQL do Aiven também reduz atividade quando ocioso | Mesma precaução |
| L03 | A sessão vive em memória (`MemoryStore`) | Cada deploy ou hibernação derruba quem estava logado. Pendência P04 do `docs/SEGURANCA.md` |
| L04 | 1 GB de banco | Folgado para o volume de um TCC |
| L05 | Sem domínio próprio | A URL é `sga-ti.onrender.com`. Suficiente para a defesa |

---

## 7. Pendências

| # | Item | Prioridade |
|---|---|---|
| P01 | **O deploy não foi executado.** Este documento descreve o caminho e a configuração está escrita, mas nenhuma conta foi criada e nada subiu | **alta** |
| P02 | O CI nunca rodou ainda — só roda depois do primeiro push com o workflow | alta, resolve sozinha |
| P03 | Não há ambiente de homologação separado: o deploy vai direto de `main` para produção | baixa, aceitável no contexto |
| P04 | Sem monitoramento nem alerta de erro em produção | baixa |
| P05 | O backup do NF006 não está agendado no ambiente de produção — ver `docs/BACKUP.md`, seção 4 | média |

---

## Fontes consultadas sobre os planos gratuitos

- [Platforms with a real free tier for developers in 2026 — Render](https://render.com/articles/platforms-with-a-real-free-tier-for-developers-in-2026)
- [Render vs Railway vs Fly.io: Pricing Compared (2026)](https://dev.to/pavel-hostim/render-vs-railway-vs-flyio-pricing-compared-2026-2e5p)
- [Always-Free MySQL Database Hosting (Fully Managed) — Aiven](https://aiven.io/free-mysql-database)
- [MySQL Hosting Options in 2026: Pricing Comparison — Bytebase](https://www.bytebase.com/blog/mysql-hosting-options-pricing-comparison/)
