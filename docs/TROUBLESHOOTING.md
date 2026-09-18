# TROUBLESHOOTING

## ISSUE-001

### Symptom
After a machine/session transition, `npm run dev` for the frontend (or
backend) appeared to succeed but the browser kept showing old content —
missing UI changes made just before the transition (e.g. a new dashboard
tab switcher). `curl`/browser hits on port 3000 and 4000 returned real
responses, so the servers *seemed* up, but they were serving stale code.

### Environment
OS: Windows 11
Version: Docker Desktop (whatever ships `docker compose`), project's
`docker-compose.yml` per DEC-030
Hardware: n/a

### Root Cause
CONFIRMED. `docker-compose.yml`'s `frontend`/`backend` services (added in
DEC-030 for the production-build "just run `docker compose up -d`" path)
use `restart: unless-stopped`. That policy makes Docker restart the
containers whenever the **Docker daemon** restarts — which happens when
Docker Desktop itself restarts (e.g. across a machine reboot or session
transition) — *regardless* of an earlier manual `docker compose stop` in
a previous session. The containers came back up serving whatever image
was last built (pre-dashboard), silently occupying ports 3000/4000 before
the freshly-started local `npm run dev` processes could bind them —
`npm run dev` itself either failed to bind (EADDRINUSE) or, confusingly,
appeared to run fine while the actual traffic was still being served by
the stale containers from an earlier port claim.

### Resolution
1. Check what's actually listening: `Get-NetTCPConnection -LocalPort 3000`
   / `4000`, then `Get-CimInstance Win32_Process -Filter "ProcessId = X"`
   to identify the owning process.
2. If the owner is `com.docker.backend` (or similar), run `docker ps` to
   see which containers are up — look specifically for this project's
   `*-backend`/`*-frontend` containers with an "Up" status you didn't
   expect.
3. `docker compose stop backend frontend` (scoped to just these two —
   leave `postgres` running if other things depend on it).
4. Kill any stray local dev process still holding the port from a failed
   bind attempt, then start fresh: `npm run dev` in both `backend/` and
   `frontend/`.
5. Re-verify in the browser that the expected (new) content renders.

This is a recurring risk, not a one-time fix: it will happen again after
any Docker daemon restart as long as `restart: unless-stopped` is set and
containers were left stopped-but-not-removed. If active local development
continues alongside the Docker path, consider `docker compose down`
(removes the containers) instead of `stop` when done with a Docker
session, or drop to `restart: "no"` for local-dev machines — not changed
here since the always-on production-style restart is the documented,
intentional behavior for hand-off/always-accessible use (DEC-030).

### Verification
Reproduced the exact symptom in a live session (blank/stale dashboard
after a session transition), traced it through the port/process/container
checks above, applied the resolution, and confirmed the new dashboard
content rendered correctly afterward.

### Related Files
- `docker-compose.yml`
- `docs/DECISIONS.md` (DEC-030, DEC-031)

### Related Commit
- (no commits yet — local working tree only, see CLAUDE.md §12)
