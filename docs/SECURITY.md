# Security

This document covers the security model and the day-to-day security
hygiene for Vortec Management — the runtime authorization model
itself is documented in `docs/ARCHITECTURE-BACKEND.md` (auth section)
and the per-decision rationale in `docs/DECISIONS.md` (DEC-005,
DEC-006, DEC-012, DEC-020, DEC-050, DEC-051, DEC-052).

## Secrets management

### What counts as a secret

| Secret | Where it lives | Rotation |
|---|---|---|
| `JWT_SECRET` (signs all bearer tokens) | `backend/.env` | At least annually, or on team-member departure. `tools/rotate-jwt-secret.ps1`. |
| `SUPER_ADMIN_PASSWORD` (bootstrap only) | `backend/.env` | After first login, rotate via the in-app Profile page (super admin's own password) or by patching the user row. |
| Postgres user password (`vortec`/`vortec_dev`) | `docker-compose.yml` + `docker-compose.staging.yml` | Change by updating both files AND running `ALTER USER vortec PASSWORD '...'` inside the container. |
| `DATABASE_URL` | `backend/.env` | Re-generate only if the DB URL itself changes. |
| `CORS_ORIGIN` | `backend/.env` | Comma-separated allow-list of frontend origins. Keep narrow. |

### What's NOT a secret

- `backend/.env.example` and `.env.staging.example` are committed
  intentionally — they hold placeholders, not real values.
- The `User.passwordHash` is a bcrypt hash, not the password — it
  is write-only to the API (DEC-006) and is never serialized in
  responses.

### Where to keep `.env` files

- **Local dev**: `backend/.env` (and only there). Gitignored.
- **Staging**: copy `.env.staging.example` to `.env.staging` (which is
  also gitignored). The staging compose loads it via `env_file`.
- **Production**: **never** in the image or in the repo. Use a secret
  store (Docker Swarm secrets, Kubernetes Secret, HashiCorp Vault,
  AWS Secrets Manager, etc.) and inject at runtime. The dev/staging
  compose patterns are placeholders; production must add a
  secret-mount step before going live.

### Rotation policy

1. **JWT secret** — rotate at least annually, and **immediately** on
   any suspicion of compromise or team-member departure. Run
   `tools/rotate-jwt-secret.ps1`; restart the backend; every active
   user is forced to re-login (intended — they get a 401 from
   `/api/auth/me` and the app redirects to `/login`).
2. **Super admin password** — rotate at least annually, and **always**
   after the first seed-time login. Use the in-app Profile page.
3. **Postgres user password** — rotate at least annually; coordinate
   with the `DATABASE_URL` change so the app isn't locked out.
4. **CORS allow-list** — review quarterly. Any entry pointing at a
   host that no longer serves Vortec is a stale attack surface and
   should be removed.

## Authentication & authorization

The runtime model (JWT + bcrypt + role-based gates) is in
`backend/src/auth.ts`. The decision history is in DEC-005/006/007/015/
050/051. Three rules the codebase enforces and **every new endpoint
must preserve**:

1. **Every write endpoint is gated by `requireAuth` first, then by a
   more specific check** (`requireSuperAdmin`, `requirePrivileged`,
   `requireProjectCreator`, `requireAssetManagerForFloor`,
   `requireInventoryManager`, `requirePurchasingViewer/Editor`,
   `requireTemplateEditor`, `requireBomViewer`, `requireActivityViewer`,
   or a custom check like `canReviewKasbon`). Do not add a write
   endpoint that only checks `requireAuth`.
2. **`passwordHash` is never serialized** in any API response
   (DEC-006). Any new endpoint that returns a `User` must go through
   the `serializeUser` / `serializeUserWithRoles` helpers in
   `routes/auth.ts` and `routes/users.ts`.
3. **File uploads are capped and validated** at the edge:
   `express.json({ limit: "16mb" })` for the request, then per-route
   checks for `data:image/...` prefix + byte length (DEC-012/020).
   No new endpoint should accept arbitrary binary or HTML.

## Rate limiting

`backend/src/routes/auth.ts` (the `POST /api/auth/login` endpoint)
applies `express-rate-limit` (see DEC-052):

- **5 requests per 15 minutes per IP** for the login endpoint. This
  blunts password-spray and credential-stuffing without locking out a
  user who legitimately mistypes a few times.
- Returns HTTP 429 with `{ error: "Too many login attempts, please
  try again later" }` when the limit is hit.
- Counts by source IP (`trust proxy` is set to `loopback` so the
  X-Forwarded-For from the LAN reverse-proxy is honored but not
  spoofable from external IPs).

**No other endpoint is rate-limited** in this pass — internal staff
on a known LAN don't need it, and the cost of false positives (a
bulk upload batch getting 429'd) outweighs the marginal benefit. If
a specific endpoint becomes a target, wrap it with
`rateLimit({ windowMs, max })` from `backend/src/auth.ts`'s
`createRateLimiter` helper.

> **Status update (2026-09-10):** the `/api/auth/login` rate limit
> introduced in DEC-052 (5 attempts per 15 min per source IP) is
> **temporarily disabled** at the operator's request — the
> `createRateLimiter` factory and `express-rate-limit` dependency
> are still wired up in `backend/src/rateLimit.ts`, but the
> middleware is no longer attached to the login route in
> `backend/src/routes/auth.ts`. The factory comment in that file
> documents how to re-enable it. Re-apply when the deployment
> leaves the single-host LAN context (i.e. becomes publicly
> reachable) or when brute-force attempts are observed.

## Audit trail

`ActivityLog` (DEC-026) records every successful mutation by an
authenticated user. The log is the source of truth for "who changed
what and when" — it is not encrypted, not append-only at the DB level
(mutations to the table are possible by a super admin), and not
retained beyond a normal backup cycle. If compliance requires
longer retention or stronger integrity guarantees, the right next
step is a `pg_dump` of the `ActivityLog` table into a write-once
location on each backup run — see `docs/BACKUP.md` for how to extend
the backup script.

`lastSeenAt` on `User` (DEC-026) gives a best-effort "online" signal
for the Activity Log's `online` panel, throttled to one write per
30 seconds per user (so it isn't a write per HTTP request). It is
**not** a real session/presence system — it answers "was this user
authenticated in the last 5 minutes?", not "is this user actively
looking at the page right now?"

## What this document deliberately does NOT do

- **No security incident response runbook** — the project is in
  initial development, single-team, single-host. A formal IR doc
  is premature; revisit when there's a production SLA.
- **No penetration-test schedule** — same reason. When the
  application leaves the dev machine, an annual pen-test by a third
  party is the minimum.
- **No bug-bounty program** — same reason.
- **No WAF / CDN / DDoS protection** — Vortec runs on a private LAN
  in its current deployment. Cloudflare / equivalent is the right
  step when this goes public.
