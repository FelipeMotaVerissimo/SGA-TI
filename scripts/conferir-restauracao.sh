#!/usr/bin/env bash
#
# NF006 — prova o ciclo completo de backup e restauração.
#
# Restaura o dump mais recente num banco novo e compara, tabela a tabela, a
# contagem de linhas contra o banco de origem. Sai com erro se qualquer tabela
# divergir.
#
# Backup que nunca foi restaurado não é backup, é esperança. Este script é o que
# transforma a rotina do NF006 em algo verificado, e roda no CI a cada push.
#
# Uso:
#   bash scripts/conferir-restauracao.sh [banco_origem] [banco_copia] [pasta_dumps]
#
# Conexão: MYSQL_HOST, MYSQL_PORT, MYSQL_USER e MYSQL_PWD (a senha vai por
# variável de ambiente, nunca por argumento — argumento é visível na lista de
# processos).

set -euo pipefail

ORIGEM="${1:-sga_ti_teste}"
COPIA="${2:-sga_ti_restaurado}"
PASTA="${3:-backups}"

HOST="${MYSQL_HOST:-127.0.0.1}"
PORTA="${MYSQL_PORT:-3306}"
USUARIO="${MYSQL_USER:-root}"

mysql_cmd() { mysql -h "$HOST" -P "$PORTA" -u "$USUARIO" "$@"; }

# ---------------------------------------------------------------- o dump
ARQUIVO=$(ls -1t "$PASTA"/*.sql 2>/dev/null | head -1 || true)
if [ -z "$ARQUIVO" ]; then
  echo "[ERRO] Nenhum arquivo .sql em $PASTA/. Rode 'npm run backup' antes." >&2
  exit 1
fi
echo "Dump    : $ARQUIVO ($(du -h "$ARQUIVO" | cut -f1))"
echo "Origem  : $ORIGEM"
echo "Copia   : $COPIA"
echo ""

# ---------------------------------------------------------------- restaurar
mysql_cmd -e "DROP DATABASE IF EXISTS \`$COPIA\`;
              CREATE DATABASE \`$COPIA\`
                CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql_cmd "$COPIA" < "$ARQUIVO"
echo "Restaurado. Comparando tabela a tabela:"
echo ""

# ---------------------------------------------------------------- comparar
TABELAS=$(mysql_cmd -N -B -e \
  "SELECT table_name FROM information_schema.tables
    WHERE table_schema='$ORIGEM' AND table_type='BASE TABLE'
    ORDER BY table_name")

if [ -z "$TABELAS" ]; then
  echo "[ERRO] O banco de origem '$ORIGEM' nao tem tabela nenhuma." >&2
  exit 1
fi

DIVERGENCIAS=0
TOTAL=0
LINHAS=0

for TABELA in $TABELAS; do
  TOTAL=$((TOTAL + 1))
  A=$(mysql_cmd -N -B "$ORIGEM" -e "SELECT COUNT(*) FROM \`$TABELA\`")
  B=$(mysql_cmd -N -B "$COPIA"  -e "SELECT COUNT(*) FROM \`$TABELA\`")

  if [ "$A" = "$B" ]; then
    echo "  ok     $TABELA: $A linha(s)"
    LINHAS=$((LINHAS + A))
  else
    echo "  FALHA  $TABELA: origem=$A copia=$B"
    DIVERGENCIAS=$((DIVERGENCIAS + 1))
  fi
done

echo ""
echo "Tabelas conferidas: $TOTAL | linhas copiadas: $LINHAS | divergencias: $DIVERGENCIAS"

if [ "$DIVERGENCIAS" -ne 0 ]; then
  echo "[ERRO] A copia nao reproduz a origem." >&2
  exit 1
fi

# A cópia precisa servir de banco de verdade, não só ter o mesmo número de
# linhas: uma consulta com junção prova que as chaves estrangeiras vieram.
echo ""
echo "Consulta de sanidade na copia (usuarios x perfis):"
mysql_cmd -B "$COPIA" -e \
  "SELECT u.login, p.nomePerfil
     FROM usuarios u JOIN perfis p ON p.id = u.perfilId
     ORDER BY u.id LIMIT 10"

echo ""
echo "Ciclo de backup e restauracao verificado."
