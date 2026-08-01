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
  - Set `DATABASE_URL=postgres://postgres:postgres@db:5432/rede_evangelica?schema=public`, `JWT_SECRET`, `COORD_*` e `LR_*`.

- **Configure WhatsApp / UazapiGO**

  O módulo usa exatamente estas nove variáveis:

  | Variável | Uso |
  |---|---|
  | `UAZAPI_BASE_URL` | URL base do servidor UazapiGO v2.1.1, sem barra final. |
  | `UAZAPI_ADMIN_TOKEN` | Token administrativo usado somente na criação da instância. |
  | `UAZAPI_WEBHOOK_SECRET` | Segredo aleatório que autentica o webhook público. |
  | `WHATSAPP_ENCRYPTION_KEY` | Chave de 32 bytes (64 hex ou base64) que cifra o token da instância no banco. |
  | `PUBLIC_API_URL` | URL HTTPS pública da API; neste deploy, `https://redeguti.ddnsfree.com/api`. |
  | `WHATSAPP_DELAY_MIN` | Atraso mínimo do lote em segundos; padrão `5`. |
  | `WHATSAPP_DELAY_MAX` | Atraso máximo do lote em segundos; padrão `15`. |
  | `WHATSAPP_UPLOAD_MAX_MB` | Tamanho máximo de mídia em MiB; padrão `20`. |
  | `WHATSAPP_MASS_MAX_RECIPIENTS` | Máximo de destinatários válidos por campanha; padrão `1000`. |

  Gere `UAZAPI_WEBHOOK_SECRET` e `WHATSAPP_ENCRYPTION_KEY` separadamente, por
  exemplo com `openssl rand -hex 32`, e nunca os reutilize entre ambientes.
  `PUBLIC_API_URL` precisa ser alcançável pelo UazapiGO e apontar para a API,
  não para a raiz do frontend.

  Use um número **WhatsApp Business dedicado** à operação, sem conversas pessoais
  ou atendimento crítico. O UazapiGO acessa uma API não oficial do WhatsApp;
  bloqueios, desconexões e mudanças de compatibilidade são riscos operacionais.

- **Backend Docker setup**
  - `backend/tsconfig.json` defines `rootDir: src`.
  - `backend/package.json` uses Prisma with config file.
  - `backend/prisma.config.ts` pulls `DATABASE_URL` from env.
  - `backend/Dockerfile` builds client + copies `src`, `prisma`, `prisma.config.ts`.
  - `docker-compose.yml` passes build arg + env for DB.

- **Build, migrate, then run containers**
  ```bash
  docker-compose build api
  docker-compose up -d db
  docker-compose run --rm api npm run prisma:deploy
  docker-compose up -d api frontend
  ```
  - A migration deve terminar com sucesso **antes** de expor a nova API. Não
    inverta essa ordem e não execute a aplicação nova contra o schema antigo.
  - If `KeyError: 'ContainerConfig'` appears, clean the stale container: `docker-compose rm -fs api && docker rm -f rede-guti_api_1 || true`.

- **Database seed**
  ```bash
  docker-compose exec api npm run seed
  ```
  - Scripts rely on `prisma.config.ts` and need `tsx` in the runtime image.
  - Confirm `DATABASE_URL` inside container: `docker-compose exec api sh -c 'echo $DATABASE_URL'`.

- **Frontend build**
  ```bash
  echo "VITE_API_URL=/api" > .env.local
  bun install
  bun run build
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
  - No módulo WhatsApp, crie a instância: o backend registra automaticamente
    `PUBLIC_API_URL/public/whatsapp/webhook` com o segredo configurado.
  - Conecte o QR, faça primeiro um envio de teste e só então uma campanha pequena
    de homologação para contatos consentidos. Siga `docs/whatsapp-homologation.md`.
  - Não existem automações, cron jobs ou disparos criados sem ação explícita da
    coordenação. Agendamentos cadastrados manualmente são entregues pelo UazapiGO.

- **Optional deployment helper**
  1. Um script de deploy pode executar `git pull`, build, migration, subida da API,
     seed, rsync e reload, preservando obrigatoriamente essa ordem.
  2. Re-run build + `rsync dist` when files change.

Let me know if you want a deploy script template or help switching to `docker compose`.
