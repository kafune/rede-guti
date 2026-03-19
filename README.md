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
