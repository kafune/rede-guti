#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_docker.sh"

cd "$ROOT_DIR"

BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
mkdir -p "$BACKUP_DIR"

timestamp="$(date +%Y%m%d_%H%M%S)"
output_path="${1:-$BACKUP_DIR/${POSTGRES_DB}_${timestamp}.sql}"

db_exec_no_tty pg_dump \
  --clean \
  --if-exists \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" > "$output_path"

echo "Backup criado em: $output_path"
