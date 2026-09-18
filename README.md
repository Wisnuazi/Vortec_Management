# Vortec Management

## Overview

Internal management system for Vortec System. Currently implements the
Organization feature: company info, org structure, roles, jobdesk, job
descriptions, and employee assignments — backed by a real database instead of
browser storage.

The project is split into two independent applications:

- `frontend/` — Next.js UI
- `backend/` — Express + Prisma REST API

See `docs/ARCHITECTURE.md` (and the frontend/backend-specific docs it links
to) for details.

## Quick Start

### Option A — local dev (hot reload, for active development)

1. Start the database: `docker compose up -d db` (repo root).
2. Backend: `cd backend && npm install && npx prisma migrate dev && npx tsx prisma/seed.ts && npm run dev`
   (copy `.env.example` to `.env` first if it doesn't exist).
3. Frontend: `cd frontend && npm install && npm run dev`
   (`.env.local` should have `NEXT_PUBLIC_API_URL=http://localhost:4000/api`).
4. Open http://localhost:3000/organization.
5. Read `CLAUDE.md` before using Claude Code.

### Option B — everything via Docker (no `npm run dev`, production build)

`docker compose up -d` (repo root) alone brings up Postgres + a built,
migrated, and seeded backend + a built frontend — open
http://localhost:3000. See `docs/DECISIONS.md` DEC-030. Code changes need
an image rebuild (`docker compose build backend`/`frontend`) to take
effect — there's no hot reload in this mode, so use Option A while actively
developing.

### Letting teammates on the same LAN reach your local instance

Both dev servers already listen on all interfaces, not just `localhost` —
three things need pointing at your machine's real LAN IP (`ipconfig` →
look for the Wi-Fi/Ethernet adapter's IPv4 address, e.g. `192.168.1.23`):
1. `frontend/.env.local`: `NEXT_PUBLIC_API_URL=http://<your-lan-ip>:4000/api`
2. `backend/.env`: `CORS_ORIGIN=http://localhost:3000,http://<your-lan-ip>:3000`
   (comma-separated — keeps `localhost` working for you too)
3. `frontend/next.config.ts`: `allowedDevOrigins: ["<your-lan-ip>"]` —
   without this, `next dev` blocks its own HMR/dev-resource requests from
   any other host, and the page loads but nothing ever renders.

Restart both `npm run dev` processes after changing any of these (Next.js
inlines `NEXT_PUBLIC_*`/reads `next.config.ts` at startup; Express/dotenv
only reads `.env` once at boot). Teammates then open
`http://<your-lan-ip>:3000`. See `docs/DECISIONS.md` DEC-039/DEC-040 —
including the caveat that this breaks again if your IP changes (e.g.
after reconnecting to Wi-Fi), since all three hardcode it.

## Documentation

- `docs/PROJECT_CONTEXT.md`
- `docs/ARCHITECTURE.md` (overview; links to `ARCHITECTURE-FRONTEND.md` / `ARCHITECTURE-BACKEND.md`)
- `docs/DEVELOPMENT_RULES.md`
- `docs/DECISIONS.md`

## Current Work

See `tasks/CURRENT_TASK.md`.
"# Vortec_Management" 
