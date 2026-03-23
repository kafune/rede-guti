#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_SERVICE="${DB_SERVICE:-db}"
POSTGRES_DB="${POSTGRES_DB:-rede_evangelica}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"

dc() {
  if command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
  elif docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  else
    echo "Docker Compose nao encontrado." >&2
    exit 1
  fi
}

db_exec() {
  dc exec "$DB_SERVICE" "$@"
}

db_exec_no_tty() {
  dc exec -T "$DB_SERVICE" "$@"
}
