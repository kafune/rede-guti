# Deployment Guide

- **Gather info**
  - VPS Ubuntu accessible via `redeguti.ddns.net`.  
  - Project root contains `docker-compose.yml`, frontend build artifacts in `dist`, backend in `backend/`.  
  - Single domain; frontend hits backend via `/api`.

- **Server prep**
  ```bash
  sudo apt update && sudo apt -y upgrade
  sudo apt -y install docker.io docker-compose nginx certbot python3-certbot-nginx
  sudo systemctl enable --now docker
  ```
  - Use either `docker-compose` (legacy) or switch to the newer `docker compose`.

- **Clone & configure**
  ```bash
  git clone <repo-url> rede-guti
  cd rede-guti
  cp backend/.env.example backend/.env
  nano backend/.env
  ```
  - Set `DATABASE_URL=postgres://postgres:postgres@db:5432/rede_evangelica?schema=public`, `JWT_SECRET`, `ADMIN_*`, `VIEWER_*`.

- **Backend Docker setup**
  - `backend/tsconfig.json` defines `rootDir: src`.
  - `backend/package.json` uses Prisma with config file.
  - `backend/prisma.config.ts` pulls `DATABASE_URL` from env.
  - `backend/Dockerfile` builds client + copies `src`, `prisma`, `prisma.config.ts`.
  - `docker-compose.yml` passes build arg + env for DB.

- **Build & run containers**
  ```bash
  docker-compose build api
  docker-compose up -d
  ```
  - If `KeyError: 'ContainerConfig'` appears, clean the stale container: `docker-compose rm -fs api && docker rm -f rede-guti_api_1 || true`.

- **Database migrate + seed**
  ```bash
  docker-compose exec api npm run prisma:deploy
  docker-compose exec api npm run seed
  ```
  - Scripts rely on `prisma.config.ts` and need `tsx` in the runtime image.
  - Confirm `DATABASE_URL` inside container: `docker-compose exec api sh -c 'echo $DATABASE_URL'`.

- **Frontend build**
  ```bash
  echo "VITE_API_URL=/api" > .env.local
  npm install
  npm run build
  sudo mkdir -p /var/www/rede/dist
  sudo rsync -av --delete dist/ /var/www/rede/dist/
  ```

- **Nginx config**
  ```nginx
  server {
    listen 80;
    server_name redeguti.ddns.net;

    root /var/www/rede/dist;
    index index.html;

    location /api/ {
      proxy_pass http://127.0.0.1:4000/;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
      try_files $uri $uri/ /index.html;
    }
  }
  ```
  ```bash
  sudo ln -sf /etc/nginx/sites-available/rede /etc/nginx/sites-enabled/rede
  sudo nginx -t && sudo systemctl reload nginx
  ```

- **Enable HTTPS**
  ```bash
  sudo certbot --nginx -d redeguti.ddns.net
  ```

- **Verify**
  - Frontend: `https://redeguti.ddns.net`.
  - API: `curl https://redeguti.ddns.net/api/municipalities`.
  - Logs: `docker-compose logs -f api` / `docker-compose logs -f db`.

- **Optional automation**
  1. Script (`deploy.sh`) for `git pull`, rebuild, migrate, seed, rsync, reload nginx.  
  2. Re-run build + `rsync dist` when files change.

Let me know if you want a deploy script template or help switching to `docker compose`.
