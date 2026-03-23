#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo "==> Atualizando codigo"
git fetch --all --prune
git pull --rebase --autostash

if command -v docker-compose >/dev/null 2>&1; then
  DC="docker-compose"
elif docker compose version >/dev/null 2>&1; then
  DC="docker compose"
else
  echo "Docker Compose nao encontrado." >&2
  exit 1
fi

echo "==> Build e deploy do backend"
$DC build api
$DC up -d

if $DC exec api npm run prisma:deploy; then
  echo "Prisma deploy ok"
else
  echo "Falhou prisma deploy" >&2
  exit 1
fi

if $DC exec api npm run seed; then
  echo "Seed ok"
else
  echo "Falhou seed" >&2
  exit 1
fi

echo "==> Build do frontend"
echo "VITE_API_URL=/api" > .env.local

if command -v bun >/dev/null 2>&1 && [ -f bun.lock ]; then
  bun install
  bun run build
else
  npm install --no-package-lock
  npm run build
fi

echo "==> Publicando frontend"
sudo mkdir -p /var/www/rede/dist
sudo rsync -av --delete dist/ /var/www/rede/dist/

echo "==> Recarregando nginx"
sudo nginx -t
sudo systemctl reload nginx

echo "Redeploy concluido."
