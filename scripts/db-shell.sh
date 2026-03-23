#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_docker.sh"

cd "$ROOT_DIR"
db_exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"
