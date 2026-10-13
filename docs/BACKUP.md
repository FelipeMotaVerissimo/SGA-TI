# NF006 — Backup e restauração

**Versão:** V01
**Data:** 06/10/2026
**Requisito:** NF006 — rotina de cópia de segurança do banco

---

## 1. O que existe

| Item | Onde |
|---|---|
| Script de dump | `scripts/backup.js` |
| Comando | `npm run backup` |
| Destino padrão | `./backups/` (no `.gitignore` — dump é cópia do banco de produção e nunca vai para o repositório) |
| Testes | `tests/unit/backup.test.js` — 15 casos |

O script usa a mesma `DATABASE_URL` da aplicação. **Não há credencial duplicada
em lugar nenhum:** se a aplicação conecta, o backup conecta.

---

## 2. Gerar o backup

```cmd
npm run backup
```

Grava em `./backups` um arquivo com o nome no formato:

```
sga_ti-2026-10-06_14-30-05.sql
```

Para escolher outra pasta:

```cmd
npm run backup -- D:\backups\sga
```

### Pré-requisito

O `mysqldump` precisa estar no `PATH`. Ele vem junto com o **MySQL Server** e
com o **MySQL Shell**. No Windows normalmente fica em:

```
C:\Program Files\MySQL\MySQL Server 8.0\bin
```

Se não estiver, o script avisa exatamente isso em vez de falhar com erro
genérico.

### Decisões do script

| Decisão | Motivo |
|---|---|
| `--single-transaction` | Faz o dump num snapshot consistente **sem travar as tabelas**. Em InnoDB, que é o caso, o sistema continua atendendo durante o backup. Sem isso, um backup no horário comercial bloquearia o balcão |
| `--routines` e `--triggers` | O dump precisa recriar o banco inteiro, não só as tabelas |
| `--default-character-set=utf8mb4` | É o charset do banco. Sem isso, acento volta corrompido na restauração |
| Senha via `MYSQL_PWD`, nunca por argumento | Argumento de processo é visível para qualquer um que liste os processos da máquina |
| A URL é lida com a classe `URL`, não com expressão regular | A senha pode conter `@`, `:` e `/`, que quebram qualquer regex ingênua |
| Nome do arquivo montado campo a campo, no fuso local | `toISOString()` converte para UTC e, à noite no horário do Brasil, o arquivo sairia com a data do dia seguinte. É o mesmo defeito que já apareceu no nome do CSV dos relatórios (D02 do Módulo 5) |
| Dump que falha é **apagado** | Arquivo pela metade é pior que arquivo nenhum: dá falsa sensação de backup |

---

## 3. Restaurar

> **Restauração sobrescreve o banco de destino.** Nunca aponte para o banco de
> produção sem ter certeza do que está fazendo.

### 3.1 Restaurar num banco novo (o caminho seguro)

```cmd
mysql -u root -p -e "CREATE DATABASE sga_ti_restaurado CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -p sga_ti_restaurado < backups\sga_ti-2026-10-06_14-30-05.sql
```

Depois, para conferir antes de confiar:

```cmd
mysql -u root -p sga_ti_restaurado -e "SELECT COUNT(*) FROM ordens_servico; SELECT COUNT(*) FROM clientes;"
```

E, para rodar o sistema contra a cópia, aponte o `.env` para ela:

```
DATABASE_URL="mysql://root:senha@localhost:3306/sga_ti_restaurado"
```

### 3.2 Restaurar por cima do banco existente

```cmd
mysql -u root -p sga_ti < backups\sga_ti-2026-10-06_14-30-05.sql
```

O dump traz `DROP TABLE IF EXISTS` antes de cada `CREATE TABLE`, então as
tabelas são recriadas. **Tudo que entrou depois do dump se perde.**

---

## 4. Agendamento

### Windows — Agendador de Tarefas

```cmd
schtasks /create /tn "Backup SGA TI" /tr "cmd /c cd /d C:\caminho\do\SGA-TI && npm run backup" /sc daily /st 23:00
```

Para conferir e remover:

```cmd
schtasks /query /tn "Backup SGA TI"
schtasks /delete /tn "Backup SGA TI" /f
```

### Linux — cron

```
0 23 * * * cd /opt/sga-ti && /usr/bin/npm run backup >> /var/log/sga-backup.log 2>&1
```

### Política sugerida

| Item | Sugestão |
|---|---|
| Frequência | Diária, fora do horário de atendimento |
| Retenção | 7 diários + 4 semanais + 12 mensais |
| Local | **Fora da máquina do banco.** Backup no mesmo disco não protege contra perda do disco |
| Verificação | Restaurar num banco de teste **pelo menos uma vez por mês**. Backup que nunca foi restaurado não é backup, é esperança |

---

## 5. O que foi testado

**Testado** (`tests/unit/backup.test.js`, 15 casos): leitura da `DATABASE_URL`
incluindo senha com caractere especial, recusa de URL de SQLite com explicação,
recusa de URL sem nome de banco, nome do arquivo com zero à esquerda e no fuso
local, e a montagem dos argumentos — em especial que **a senha nunca aparece
entre eles**.

Os dois caminhos de erro foram exercitados na máquina:

```
[ERRO] mysqldump não encontrado no PATH.
[ERRO] O backup é de MySQL, mas DATABASE_URL aponta para "file".
```

### O ciclo dump → restauração roda no CI

Ele exigia `mysqldump` e um servidor MySQL, e nenhum dos dois existe na máquina
de desenvolvimento. **Mas os dois existem no CI**, que já sobe um MySQL 8 de
serviço — então o ciclo completo passou a ser executado **a cada push**, em vez
de uma vez só, à mão, antes da entrega.

O passo roda `scripts/conferir-restauracao.sh`, que:

1. pega o dump mais recente gerado por `npm run backup`;
2. cria um banco novo (`sga_ti_restaurado`) e restaura o dump nele;
3. compara **tabela a tabela** a contagem de linhas entre origem e cópia;
4. **falha o build** se qualquer tabela divergir;
5. executa uma consulta com junção (`usuarios × perfis`) na cópia, porque contar
   linhas não prova que as chaves estrangeiras vieram junto.

O passo roda **depois** dos testes de propósito: aí o banco tem dados espalhados
pelas tabelas, e não apenas o seed.

### Rodar o mesmo ciclo na mão

Com um MySQL no ar:

```cmd
npm run backup
bash scripts/conferir-restauracao.sh sga_ti sga_ti_restaurado backups
```

A conexão vem de `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER` e `MYSQL_PWD`.

---

## 6. Pendências

| # | Item | Prioridade |
|---|---|---|
| P01 | ~~Ciclo dump → restauração não executado~~ — **resolvido**: roda no CI a cada push, ver seção 5 | — |
| P02 | O dump não é compactado. Um `.sql` de um banco com histórico longo fica grande; `gzip` reduziria bastante | baixa |
| P03 | Não há verificação automática de integridade do arquivo gerado (hash, ou restauração de fumaça) | baixa |
| P04 | A rotação/retenção é manual: o script grava e nunca apaga nada | média |
