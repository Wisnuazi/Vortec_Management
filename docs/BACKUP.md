# Backup & Restore

This document covers the **database** backup strategy for Vortec
Management. The frontend and backend containers themselves hold **no
durable state** (their images are reproducible from `Dockerfile`s +
the `prisma/` schema); the only thing that needs backing up is the
Postgres database inside the `vortec-management-postgres` container.

## What gets backed up

A full logical backup of the `vortec_management` database — every
table, schema, row, and sequence — produced by `pg_dump` running
*inside* the Postgres container (so no `psql`/`pg_dump` is required
on the Windows host). Output is a single `.sql.gz` file per run.

## What does NOT get backed up

- **Uploaded files / photos** — the `base64` data URLs stored on
  `User.avatarUrl`, `Asset.photoUrl`, `DocumentTemplate.dataUrl`,
  `Attachment.dataUrl`, `KasbonItem.receiptPhotoUrl` / `itemPhotoUrl`
  are already part of the database rows (DEC-012/020), so they ARE in
  the backup. No separate object storage to back up yet.
- **Frontend static assets** — reproducible from `next build` + the
  repo.
- **The Docker volumes themselves** — `vortec_pgdata` is the only named
  volume that holds state, and `pg_dump`'s logical dump is preferred
  over a raw volume copy because it survives Postgres major-version
  upgrades (DEC-002 chose the dedicated container for exactly this
  reason: the volume can be replaced with a fresh dump from any other
  Postgres 16 instance).

## Backup script

`tools/backup-db.ps1` is the single supported backup entry point.
It:

1. Verifies the `vortec-management-postgres` container is running.
2. Runs `pg_dump` inside the container and streams the SQL back.
3. Compresses it with gzip to `tools/backups/vortec_vortec_management_YYYYMMDD-HHMMSS.sql.gz`.
4. Rotates the `tools/backups/` directory to keep only the most recent
   `N` files (default 14, ~2 weeks of daily backups).

Manual run from the repo root:

```powershell
pwsh -File tools/backup-db.ps1                # keep 14
pwsh -File tools/backup-db.ps1 -Keep 7        # keep 7
pwsh -File tools/backup-db.ps1 -Container xyz # override container name
```

`tools/backups/` is gitignored (the script writes a `.gitignore` if
missing), so backups never end up in version control.

## Schedule it

The script itself doesn't schedule — let the **OS scheduler** own the
cron-equivalent:

**Windows Task Scheduler (recommended for local dev / single-host deploys):**

1. Open Task Scheduler → "Create Task" (not "Create Basic Task").
2. **General** tab: name `Vortec DB Backup`, "Run whether user is logged on or not".
3. **Triggers** tab: New → Daily, start at `02:00:00`, "Enabled".
4. **Actions** tab: New → Action = "Start a program".
   - Program/script: `pwsh`
   - Arguments: `-NoProfile -File "D:\Internal Vortec\Vortec Management\tools\backup-db.ps1"`
   - Start in: `D:\Internal Vortec\Vortec Management`
5. **Conditions** tab: uncheck "Start only if on AC power" if the host
   is a laptop/server that may sleep.
6. **Settings** tab: "If the task fails, restart every" = 1 hour,
   "Attempt to restart up to" = 3 times.

The script is idempotent and safe to run while the backend/frontend
containers are up — `pg_dump` takes a point-in-time consistent
snapshot and does not block writes.

**Linux / production host (when this leaves Windows):**

```cron
0 2 * * * /usr/bin/pwsh -File /opt/vortec/tools/backup-db.ps1 -Keep 30
```

The 30-day retention is more typical of a hosted deployment.

## Off-host copy (recommended for real production)

The `tools/backups/` directory is local to the dev/prod host. For
real disaster recovery, copy each backup **off-host** shortly after
creation — the same `cron`/Task Scheduler job can chain a copy step:

- Windows: `Copy-Item $outPath \\backup-server\vortec\` after the
  script writes the file.
- Linux: `rclone copy` to S3-compatible storage, or `rsync` to a
  remote host.

A local-only backup is not a backup — if the host dies, both the
database AND the backup are gone.

## Restore

To restore a backup into a **running** Postgres container
(previewing a backup, or recovering from data corruption):

```powershell
# 1. Stop the backend so it isn't writing while we restore
docker compose stop backend frontend

# 2. Drop & recreate the database inside the container
docker exec -i vortec-management-postgres psql -U vortec -d postgres -c "DROP DATABASE vortec_management;"
docker exec -i vortec-management-postgres psql -U vortec -d postgres -c "CREATE DATABASE vortec_management OWNER vortec;"

# 3. Stream the gunzipped dump back in
Get-Content tools\backups\vortec_vortec_management_YYYYMMDD-HHMMSS.sql.gz |
  docker exec -i vortec-management-postgres psql -U vortec -d vortec_management

# 4. Bring everything back up
docker compose up -d
```

To restore to a **fresh container** (e.g. moving to a new host):

```powershell
# 1. Bring up just the new Postgres container (same compose, fresh volume)
docker compose up -d db

# 2. Wait for it to be healthy, then restore as above
```

`pg_dump`'s `--clean --if-exists` flags in the backup script mean the
SQL includes `DROP ... IF EXISTS` statements, so the restore tolerates
re-running into a partially-populated database.

## Verification (recommended weekly)

A backup you haven't restored is a backup you don't have. Schedule a
**monthly restore drill** into a throwaway container:

```powershell
# Spin up a separate container on a different host port for the drill
docker run -d --name vortec-restore-drill -p 5434:5432 -e POSTGRES_USER=vortec -e POSTGRES_PASSWORD=vortec_dev -e POSTGRES_DB=vortec_management postgres:16-alpine

# Restore the latest backup into it
Get-Content tools\backups\vortec_vortec_management_<latest>.sql.gz |
  docker exec -i vortec-restore-drill psql -U vortec -d vortec_management

# Sanity-check: counts of key tables
docker exec vortec-restore-drill psql -U vortec -d vortec_management -c "SELECT 'users', count(*) FROM \"User\" UNION ALL SELECT 'projects', count(*) FROM \"Project\" UNION ALL SELECT 'roles', count(*) FROM \"Role\";"

# Clean up
docker rm -f vortec-restore-drill
```

If the row counts roughly match what the app reports in the live
dashboard, the backup is good. If they're wildly off, the backup is
silent-broken and the schedule needs investigating.

## What's intentionally NOT here

- **WAL archiving / PITR (point-in-time recovery)** — overkill for the
  current scale. A daily logical dump is sufficient; revisit if/when
  the team grows or the data volume makes 24h of lost writes painful.
- **Encrypted backups at rest** — the backup file is on the same host
  as the database. If the host is encrypted (BitLocker on Windows,
  LUKS on Linux), the backup inherits that. Separate encryption is
  only needed if the backup is sent off-host to a less-trusted
  location — and that copy step is the place to add it (e.g.
  `rclone crypt` to an S3 bucket).
- **Continuous archiving / replication** — same as PITR; revisit when
  the SLA requires it.
