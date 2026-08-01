# Rede Evangélica SP

## Frontend (Vite + React)

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Run the app:
   `npm run dev`

## Backend (Fastify + Postgres)

### Local setup

1. Go to the backend folder:
   `cd backend`
2. Copy env example and adjust secrets:
   `cp .env.example .env`
3. Install dependencies:
   `npm install`
4. Run migrations and seed users:
   `bun run prisma:deploy`
   `bun run seed`
5. Start the API:
   `npm run dev`

The API will start at `http://localhost:4000`.

### Docker (VPS)

1. Create `backend/.env` from the example and set `JWT_SECRET` + admin credentials.
2. Run:
   `docker compose up -d db`
   `docker compose run --rm api bun run prisma:deploy`
   `docker compose up -d api frontend`

Migrations are always applied before the new API process is exposed.

### Database helpers

From the project root, you can use Bun scripts for the Postgres container:

- `bun run db:shell` opens `psql` inside the `db` container.
- `bun run db:status` shows container status, readiness, and current tables.
- `bun run db:dump` creates a SQL backup in `./backups`.
- `bun run db:restore -- ./backups/file.sql` restores a SQL backup into the container database.
- `bun run db:logs` tails database logs.

### Core endpoints

- `POST /auth/login`
- `GET /auth/me`
- `GET /indications`
- `POST /indications` (admin)
- `DELETE /indications/:id` (admin)
- `GET /churches`
- `POST /churches` (admin)
- `GET /municipalities`
- `POST /municipalities` (admin)
- `GET /users` (admin)
- `POST /users` (admin)
- `GET /settings` / `PATCH /settings` (link do grupo + aviso da coordenação)
- `GET /engagement/me` / `GET /engagement/leaderboard` / `GET /engagement/leaderboard/weekly`
- `GET /engagement/ledger` / `POST /engagement/recalculate` / `POST /engagement/scan-inactive` (coordenador)

## WhatsApp / UazapiGO

O módulo de WhatsApp é restrito ao coordenador e cobre conexão por QR, mídias,
templates, prévias de público, envio de teste, campanhas imediatas/agendadas,
webhooks, opt-out e controles de campanha. Configure as nove variáveis descritas
em `backend/.env.example` e `DEPLOY.md`; `PUBLIC_API_URL` deve ser a URL HTTPS
pública da API para o registro do webhook.

Use um número WhatsApp Business dedicado. O UazapiGO usa API não oficial do
WhatsApp e, portanto, existe risco de bloqueio ou desconexão. Antes de qualquer
uso operacional, faça envio de teste e uma campanha pequena com contatos
consentidos, seguindo `docs/whatsapp-homologation.md`.

Não há automações ou envios iniciados sem ação explícita da coordenação. Um
agendamento manual é enviado pelo UazapiGO na data escolhida.
