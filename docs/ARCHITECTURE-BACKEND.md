# BACKEND ARCHITECTURE

## Status
Version: 0.2
Status: INITIAL
Last Updated: 2026-09-07

## Overview
`backend/` is a standalone Node.js/Express REST API backed by PostgreSQL via
Prisma. It exposes the Organization feature (roles, jobdesk, employees),
authentication + user management, and the Assets feature (floors, assets).
It is deployed and run independently from `frontend/`.

## Technology Stack
- Runtime: Node.js (TypeScript via `tsx` in dev, compiled with `tsc` for
  production)
- Framework: Express 4
- ORM: Prisma 6 (`@prisma/client`)
- Database: PostgreSQL 16 (Docker container `vortec-management-postgres`,
  host port 5433)
- Auth: `bcryptjs` (password hashing), `jsonwebtoken` (bearer tokens)

## Repository Structure
```text
backend/
├── src/
│   ├── index.ts          # Express app entry point, CORS + JSON middleware
│   ├── prisma.ts          # Shared PrismaClient instance
│   ├── auth.ts             # hashPassword/verifyPassword/signToken, requireAuth,
│   │                        # requireSuperAdmin middleware
│   └── routes/
│       ├── roles.ts        # /api/roles (Organization)
│       ├── auth.ts         # /api/auth (login, me, self-service profile update)
│       ├── users.ts        # /api/users (super-admin-only user CRUD)
│       └── floors.ts       # /api/floors (Assets)
├── prisma/
│   ├── schema.prisma       # Role / Employee / Jobdesk / User / Floor / Asset
│   ├── seed.ts             # Seeds org structure, super admin, floors (see below)
│   └── migrations/
├── tsconfig.json
├── .env                    # DATABASE_URL, PORT, CORS_ORIGIN, JWT_SECRET,
│                             SUPER_ADMIN_EMAIL/PASSWORD (not committed)
└── .env.example
```

## Data Model
```text
Role
├── id (cuid), title, jobDescription, parentId (self-relation, nullable)
├── children: Role[]        (onDelete: Cascade — deleting a role deletes its subtree)
├── employees: Employee[]
├── jobdesk: Jobdesk[]
├── supervisedBy / supervises: RoleSupervision[]  (additive "also supervises" edges — see below)
└── users: User[]           (via UserRole join table — see Addendum 3)

RoleSupervision(id, roleId, supervisorId, unique[roleId, supervisorId])
  — a many-to-many self-join on Role, additive to parentId. onDelete: Cascade both directions.

Employee(id, name, roleId)
Jobdesk(id, text, order, roleId)

User(id, email [unique], username [unique, nullable], passwordHash, name,
     isSuperAdmin, avatarUrl, theme, locale) — roles via UserRole (see Addendum 3)

Floor(id, label, usage, description, order)
└── assets: Asset[]

Asset(id, code [unique, nullable], name, quantity, notes, photoUrl [nullable], acquiredAt [nullable], floorId)
```

Role uses a **single parent** (`parentId`) for its primary tree — a general
graph was rejected as overkill for one matrix case. Vortec System's actual
dual-supervision reporting line for the Technical & Quality Team (Operational
Leader as tree parent, Project Manager as an additional coordinator) is now
modeled by the separate `RoleSupervision` table above, additive to the tree.
See `docs/DECISIONS.md` DEC-019 (supersedes DEC-003).

## API

### `/api/auth`
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/login` | none | `{ identifier, password }` → `{ token, user }`. `identifier` matches email or username. |
| GET | `/me` | any user | Current user. |
| PATCH | `/me` | any user | Self-service update: `{ name?, theme?, locale?, password? }`. |

### `/api/users` (super admin only, all routes)
| Method | Path | Purpose |
|---|---|---|
| GET | `/` | List all users (with role title). |
| POST | `/` | Create a user (`{ email, username?, password, name, roleId?, isSuperAdmin? }`). |
| PATCH | `/:id` | Update a user (`{ name?, username?, roleId?, isSuperAdmin?, password? }`); cannot revoke your own super-admin status. |
| DELETE | `/:id` | Delete a user; cannot delete yourself. |

`passwordHash` is never included in any response — a super admin can set a
user's password but never read it back (see DEC-006).

### `/api/roles` (Organization — GET needs any login, writes need super admin)
| Method | Path | Purpose |
|---|---|---|
| GET | `/` | List all roles (with employees + jobdesk). |
| POST | `/` | Create a role (`{ parentId, title }`). |
| PATCH | `/:id` | Rename a role (`{ title }`). |
| PATCH | `/:id/job-description` | Update job description (`{ jobDescription }`). |
| DELETE | `/:id` | Delete a role (cascades to descendants/employees/jobdesk). |
| POST | `/:id/employees` | Add an employee (`{ name }`). |
| DELETE | `/:id/employees/:employeeId` | Remove an employee. |
| POST | `/:id/jobdesk` | Append a jobdesk item (`{ text }`). |
| DELETE | `/:id/jobdesk/:jobdeskId` | Remove a jobdesk item. |
| PUT | `/:id/supervisors` | Replace the "also supervises" set (`{ supervisorIds: string[] }`) — additive to `parentId`, see DEC-019. |

### `/api/floors` (Assets)
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/` | any login | List all floors (with nested assets), ordered. |
| PATCH | `/:id` | super admin | Update a floor's description (`{ description }`). |
| POST | `/:id/assets` | Assets/Operational Manager/Operational Leader/super admin | Add an asset to a floor (`{ code?, name, quantity, notes, photoUrl? }`). |
| PATCH | `/:floorId/assets/:assetId` | Assets/Operational Manager/Operational Leader/super admin | Update an asset. |
| DELETE | `/:floorId/assets/:assetId` | Assets/Operational Manager/Operational Leader/super admin | Remove an asset. |

Floor *description* stays super-admin-only (it's Organization content, not
the Assets menu); asset mutations use the narrower role-title check
(`requireAssetManager` in `src/routes/floors.ts`) — see DEC-020.

Authentication: JWT bearer token (`Authorization: Bearer <token>`, 12h
expiry, `JWT_SECRET` in `backend/.env`). `requireAuth` middleware attaches
`req.authUser = { id, isSuperAdmin }`; `requireSuperAdmin` gates
mutation-only routes. CORS is additionally restricted to `CORS_ORIGIN` (dev:
`http://localhost:3000`).

## Seeding (`prisma/seed.ts`)
Idempotent, safe to re-run:
- `seedRoles()` — real Vortec System org structure (skipped if roles already exist).
- `seedFloors()` — 5 floors from `layout_building.md` with drafted descriptions (skipped if floors already exist).
- `seedSuperAdmin()` — upserts by `SUPER_ADMIN_EMAIL`; if `SUPER_ADMIN_PASSWORD` is unset, generates a random password and prints it once (never stored in a file).

## Deployment Architecture
Development: `npm run dev` (tsx watch) against the local Docker Postgres.
Staging/Production: not defined yet.

## Security Architecture
Authentication: JWT bearer tokens, bcrypt-hashed passwords (12 rounds).
Authorization: `isSuperAdmin` boolean gate — super admin can mutate
Organization/Assets/Users data; every other logged-in user is read-only on
Organization/Assets and has no access to `/api/users`.
Secret management: `DATABASE_URL`, `JWT_SECRET`, and super-admin bootstrap
values live in `backend/.env` (gitignored); `.env.example` documents
required keys with placeholder/dev-only values.
Network boundaries: backend only accepts requests from `CORS_ORIGIN`.

## Known Technical Debt
- No input validation library (manual trim/empty/length checks only).
- No refresh-token flow — a token simply expires after 12h.
- Authorization is mostly a single boolean (`isSuperAdmin`); a handful of
  features (Projects since DEC-016, Assets since DEC-020) additionally check
  specific role titles via `UserRole` membership — not a general granular
  permission system, so each new "narrower than super admin" rule is its own
  bespoke check to keep in sync if role titles are renamed.
- `Role.parentId` remains single-parent by design (the primary tree); the
  one known matrix case (Technical & Quality Team dual supervision) is
  modeled additively via `RoleSupervision`, not by generalizing `parentId`
  itself — see `docs/DECISIONS.md` DEC-019.

## Architecture Constraints
Claude must not change these without explicit architectural review:
- The API response shape for a role (`id, title, parentId, jobDescription,
  employees: [{id,name}], jobdesk: [{id,text}], coSupervisorIds: string[]`)
  — the frontend's `useOrgRoles` hook depends on this exact shape.
- The API response shape for a floor (`id, label, usage, description,
  order, assets: [{id,code,name,quantity,notes,photoUrl}]`) — `useFloors`
  depends on it.
- `passwordHash` must never be added to any serialized API response.

## Addendum (2026-09-07, later same day)

Added since the table above was written:
- `Material` / `StockMovement` models + `src/routes/materials.ts`
  (`/api/materials`, same auth pattern as `/api/floors`: any logged-in user
  can `GET`, only super admin can mutate). Stock is computed on read, not
  stored — see `docs/DECISIONS.md` DEC-013.
- `User.avatarUrl` (nullable, base64 data URL) — see DEC-012.
  `express.json()` body limit raised to `2mb` in `src/index.ts` to
  accommodate it.

## Addendum 2 (2026-09-07)

- `Project` / `ProjectDocument` models + `src/routes/projects.ts`
  (`/api/projects`, same auth pattern: any logged-in user can `GET`, only
  super admin can mutate). `ProjectStage` enum and the standard
  `ProjectDocument` checklist are both sourced from
  `assets/template/doc/Vortec_Operation_Production_Process.pdf` — see
  `docs/DECISIONS.md` DEC-014.

## Addendum 3 (2026-09-07)

- `User.roleId` (single) replaced by `UserRole` (many-to-many join table) —
  see DEC-015. `src/auth.ts` gained `getUserRoles`/`userHasRoleId`/
  `userHasRoleTitle` helpers used throughout permission checks.
- `Task`/project permission model split: `requireProjectCreator`
  (Operational Manager or super admin) gates `/api/projects` CRUD;
  `canManageProjectTasks` (Project Manager, the project's PIC, or super
  admin) gates the task list; `canActOnTask` (whoever holds the assigned
  role, or super admin) still gates status changes — see DEC-016.
- `GET /api/users/basic` (id + name, any logged-in user) added ahead of the
  `requireSuperAdmin` gate on `usersRouter`, for PIC pickers.
- `MaterialRequest`/`MaterialRequestItem` models + sub-routes under
  `/api/projects/:id/material-requests` — see DEC-017.

## Addendum 4 (2026-09-07)

- `RoleSupervision` model (additive many-to-many Role self-join) + serialized
  `coSupervisorIds` + `PUT /api/roles/:id/supervisors` — see DEC-019
  (supersedes DEC-003).
- `Asset.photoUrl` (nullable, base64 data URL, same pattern as
  `User.avatarUrl`) and a narrower `requireAssetManager` permission gate
  (Assets/Operational Manager/Operational Leader/super admin, replacing
  super-admin-only) on the three `/api/floors/*/assets*` mutation routes —
  see DEC-020. `src/auth.ts` gained `userHasAnyRoleTitle`.
- `prisma/seed.ts` gained an idempotent `seedAssetsAug2026()` importing the
  real asset inventory from `assets/template/doc/asset_vortec_aug_2026.xlsx`,
  split per floor.
- `Asset.acquiredAt` (nullable `DateTime`) — see DEC-021. Serialized as an
  ISO string; the frontend derives a display-only "age" from it rather than
  storing age separately.

## Addendum 5 (2026-09-07)

- `Asset.price` (nullable `Float`) — a dedicated column, not folded into
  `notes` (existing `asset_vortec_aug_2026.xlsx`-imported rows were
  backfilled: price extracted out of their notes text into this column).
- `Vendor` model (`name`, `type` enum `COMPANY`/`MARKETPLACE`, optional
  `link`/`contact`, `notes`) + `src/routes/vendors.ts`
  (`/api/vendors`) — see DEC-022.
- `src/routes/purchasing.ts` (`/api/purchasing/material-requests`,
  `/api/purchasing/tasks`) — cross-project aggregation views, not scoped to
  one project like everything under `/api/projects`. Exports
  `requirePurchasingViewer` (Purchasing/Operational Manager/Project
  Manager/Operational Leader/super admin) and `requirePurchasingEditor`
  (Purchasing/super admin only), both reused by `routes/vendors.ts` — see
  DEC-022.

## Addendum 6 (2026-09-07)

- `src/routes/approvals.ts` (`GET /api/approvals`) — personalized,
  cross-project inbox (gate-approval tasks + PM's SUBMITTED material
  requests); no separate mutation endpoints, reuses the existing task/
  material-request review endpoints — see DEC-023.
- `src/routes/notifications.ts` (`GET /api/notifications`) — due-date
  reminders (overdue/upcoming tasks and projects) computed live, no new
  persistent state, plus a `pendingApprovalsCount` bridging to Approvals —
  see DEC-024.
- `src/activityLog.ts` (`logActivity`/`logActivityFor`, fire-and-forget) +
  `src/routes/activity.ts` (`GET /api/activity-log`,
  `GET /api/activity-log/online`) + `ActivityLog` model +
  `User.lastSeenAt` — see DEC-026. `requireAuth` in `src/auth.ts` now also
  throttle-updates `lastSeenAt` and attaches `name` to `req.authUser`
  (previously just `{id, isSuperAdmin}`).
- `Asset.price` and most other mutation routes across `roles.ts`,
  `floors.ts`, `materials.ts`, `projects.ts`, `users.ts`, `vendors.ts` now
  call `logActivityFor(req, {...})` after a successful write — see DEC-026
  for exactly which mutations are (and deliberately aren't) covered.
