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
   `npx prisma migrate dev --name init`
   `npm run seed`
5. Start the API:
   `npm run dev`

The API will start at `http://localhost:4000`.

### Docker (VPS)

1. Create `backend/.env` from the example and set `JWT_SECRET` + admin credentials.
2. Run:
   `docker compose up -d`

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
- `GET /engagement/ledger` / `POST /engagement/recalculate` (coordenador)

### Automation endpoints (n8n)

Aceitam `Authorization: Bearer <AUTOMATION_API_TOKEN>` (env do backend) ou JWT de coordenador:

- `POST /automation/recalculate` — recalcula contadores semanais/mensais, score e ranking (agendar diariamente)
- `POST /automation/scan-inactive` — dispara `leader.inactive_7_days` para lideranças paradas (agendar diariamente)
- `GET /automation/event-reminders?window=today|tomorrow` — eventos do dia/véspera com convidados APROVADO/CONFIRMADO para lembrete
- `GET /automation/weekly-leader-summaries` — resumo semanal por liderança (pontos, indicações, ranking) com WhatsApp cadastrado

### Automações WhatsApp (n8n)

Workflows prontos em `automations/n8n/` (importar no n8n):

- `engajamento-router-eventos.json` — ponto de entrada do `ENGAGEMENT_WEBHOOK_URL`: avisa o líder quando alguém entra pelo link dele, parabeniza por meta semanal e resgata líderes inativos
- `manutencao-diaria-recalculo-inativos.json` — cron diário 03h: recalcula ranking + varre inativos
- `eventos-lembrete-confirmados.json` — lembrete de evento na véspera (18h) e no dia (08h), com link de confirmação para quem ainda não confirmou
- `engajamento-resumo-semanal-lider.json` — resumo individual de segunda-feira para cada líder
- `engajamento-resumo-semanal-coordenador.json` — resumo de segunda-feira para o coordenador
- `engajamento-parabenizar-meta-semanal.json` — alternativa single-purpose ao router (não ativar junto com ele)

Variáveis no n8n: `REDE_GUTI_API_URL`, `WHATSAPP_API_URL` (Evolution API ou similar).
Credentials: `Rede Guti Automation Token` (Bearer = `AUTOMATION_API_TOKEN`) e `WhatsApp API Header Auth`.
No backend, configure `ENGAGEMENT_WEBHOOK_URL` apontando para o webhook do router e `APP_PUBLIC_URL` com a URL pública do app.

> O número de WhatsApp de cada liderança é cadastrado no painel Rede (criação/edição de usuário). Sem número, a liderança não recebe as automações.
