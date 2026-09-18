# PROJECT CONTEXT

## Project Name
Vortec Management

## Problem Statement
Vortec System (an engineering company that designs, assembles, and tests
integrated mechanical-electrical systems) currently keeps organizational data —
roles, reporting structure, jobdesk, job descriptions, employee assignments —
in ad-hoc documents (see `assets/template/doc/`). There is no shared, editable
system of record, so structure and jobdesk information drifts out of date and
isn't easily accessible to the team.

## Objectives
1. Provide a single shared web application where company/organization data
   (structure, roles, jobdesk, employees) is stored centrally instead of in
   scattered documents or a single browser's local storage.
2. Let authorized staff edit roles, jobdesk, and job descriptions directly in
   the app, with changes visible to everyone.
3. Establish a foundation (frontend + backend + database) that later modules
   of Vortec Management can build on.

## Users
- Management / HR — maintain org structure, roles, jobdesk.
- Employees — look up structure, roles, and jobdesk for reference.

## Main Use Cases

### Use Case 1 — Maintain organization structure
Description: A user adds, renames, or removes roles in the org tree, and
assigns/removes employees per role.
Expected result: Changes persist in Postgres via the backend API and are
visible to any user loading the page.

### Use Case 2 — Maintain jobdesk & job description
Description: A user adds/removes jobdesk items and edits the job description
text for a given role.
Expected result: Changes persist in Postgres and render for all users.

## Scope

### Included
- Organization feature: company info (draft), org structure tree, role list
  with jobdesk + job description, employee assignment per role.
- REST API backed by PostgreSQL (Prisma) for the Organization feature.

### Not Included (not yet — see `tasks/BACKLOG.md`)
- Authentication / authorization (there is currently no login; "Belum login"
  is a placeholder in the topbar).
- Modules beyond Organization (e.g. inventory, project management, finance).
- Multi-parent / matrix reporting lines (see `docs/DECISIONS.md` — the data
  model currently supports a single parent per role).

## Constraints

### Technical
- Frontend: Next.js (App Router) + React, deployed separately from the backend.
- Backend: Node.js + Express + Prisma, REST API.
- Database: PostgreSQL, run via Docker Compose on host port 5433, in a
  dedicated container/volume separate from other local projects.

### Business
- Real company data (structure, employees, jobdesk) is sourced from
  `assets/template/doc/organization_structure.md` and
  `assets/template/doc/employees.md`. Generated jobdesk/job-description text
  and the company profile summary are drafts pending confirmation by Vortec
  System — see the "DRAFT" badge on the Info Perusahaan tab.

### Operational
- Local development only at this stage; no staging/production environment
  defined yet.

## External Systems

| System | Purpose | Interface |
|---|---|---|
| PostgreSQL (`vortec-management-postgres`) | Application database | Prisma (TCP, port 5433) |

## Environments

### Development
Frontend: `npm run dev` in `frontend/` (http://localhost:3000).
Backend: `npm run dev` in `backend/` (http://localhost:4000).
Database: `docker compose up -d` at repo root (Postgres on host port 5433).

### Staging
Not defined yet.

### Production
Not defined yet.

## Success Criteria
1. Organization data (structure, roles, jobdesk, employees) survives a full
   restart of frontend, backend, and database — i.e. it is truly persisted in
   Postgres, not browser storage.
2. Any two browsers/users looking at `/organization` see the same data.
3. Real Vortec System structure/employees from `assets/template/doc/` are
   reviewed and confirmed accurate by the user.
