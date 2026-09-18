# SYSTEM ARCHITECTURE

## Architecture Status
Version: 0.1
Status: INITIAL
Last Updated: 2026-09-07

## System Overview
Vortec Management is split into two independently run projects: a Next.js
frontend and an Express/Prisma backend, talking over a REST API, backed by a
dedicated PostgreSQL database. See the decision record for why they are
split: `docs/DECISIONS.md`.

Detailed architecture per side lives in its own document:
- `docs/ARCHITECTURE-FRONTEND.md`
- `docs/ARCHITECTURE-BACKEND.md`

This file covers only the system-level picture shared by both.

## High-Level Architecture

```text
Browser
   |
   v
frontend/ (Next.js, :3000)
   |  fetch() — NEXT_PUBLIC_API_URL
   v
backend/ (Express + Prisma, :4000)
   |
   v
PostgreSQL (Docker: vortec-management-postgres, host port 5433)
```

## Technology Stack

### Frontend
Framework: Next.js (App Router)
Language: TypeScript

### Backend
Framework: Express
Language: TypeScript (Prisma ORM)

### Database
Database: PostgreSQL 16

### Infrastructure
Runtime: Node.js
Container: Docker Compose (`docker-compose.yml`, database only — frontend and
backend run directly with `npm run dev` in local development)
Reverse Proxy: none yet

## Repository Structure

```text
frontend/    Next.js app (see ARCHITECTURE-FRONTEND.md)
backend/     Express + Prisma API (see ARCHITECTURE-BACKEND.md)
docker-compose.yml   Postgres service definition
docs/        Project documentation
tasks/       Task tracking
assets/template/doc/  Source documents for real Vortec System org data
```

## Data Flow
Browser request
→ Next.js page (`/organization`)
→ `useOrgRoles()` fetch
→ Express REST API (`/api/roles/*`)
→ Prisma
→ PostgreSQL
→ JSON response
→ React state → render

## Deployment Architecture
Development: frontend and backend run as separate local processes
(`npm run dev`); database runs in Docker. No staging/production defined yet.

## Known Technical Debt
- No authentication anywhere in the stack.
- Single-parent role hierarchy cannot represent Vortec System's real
  dual-supervision reporting line — see `docs/DECISIONS.md`.
- No staging/production environment or CI/CD defined yet.

## Architecture Constraints
Claude must not change these without explicit architectural review:
- Frontend and backend are separate projects/deployables — do not merge them
  back into a single Next.js app without a recorded decision.
- The backend is the only thing allowed to talk to PostgreSQL directly.
