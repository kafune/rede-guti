#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_docker.sh"

cd "$ROOT_DIR"

if [ "${1:-}" = "" ]; then
  echo "Uso: bash ./scripts/db-restore.sh <arquivo.sql>" >&2
  exit 1
fi

input_path="$1"

if [ ! -f "$input_path" ]; then
  echo "Arquivo nao encontrado: $input_path" >&2
  exit 1
fi

db_exec_no_tty psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" < "$input_path"

echo "Restore concluido a partir de: $input_path"
