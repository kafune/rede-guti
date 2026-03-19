#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_docker.sh"

cd "$ROOT_DIR"

echo "==> Container status"
dc ps "$DB_SERVICE"

echo
echo "==> Postgres readiness"
db_exec pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"

echo
echo "==> Tables"
db_exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c '\dt'
