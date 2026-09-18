<#
  Vortec Management - Postgres backup script
  ------------------------------------------
  Runs `pg_dump` inside the running `vortec-management-postgres` container
  (no `psql`/`pg_dump` on the Windows host PATH), writes a compressed
  SQL dump to `tools/backups/`, and rotates old backups so we keep the
  most recent N (default 14, ~2 weeks of daily backups).

  Usage (from the repo root, in PowerShell):
    powershell -File tools/backup-db.ps1                 # default: keep 14
    powershell -File tools/backup-db.ps1 -Keep 7         # keep 7
    powershell -File tools/backup-db.ps1 -Container xyz  # override container name

  To schedule daily at 02:00, see docs/BACKUP.md (Windows Task Scheduler
  example) - do NOT put the schedule inside this script; the OS scheduler
  is the right place for it.

  This script is safe to run while the backend/frontend containers are up
  - `pg_dump` is a non-blocking, point-in-time consistent snapshot for
  a single database, so concurrent writes are fine.
#>

[CmdletBinding()]
param(
  [int] $Keep = 14,
  [string] $Container = "vortec-management-postgres",
  [string] $Database = "vortec_management",
  [string] $User = "vortec",
  [string] $OutDir
)

# Resolve the script's own directory robustly — `$PSScriptRoot` is
# empty when invoked via `powershell -File` from a different cwd
# under some PowerShell versions, so we fall back to $MyInvocation.
if (-not $PSScriptRoot) {
  $PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
}
if (-not $OutDir) {
  $OutDir = (Join-Path $PSScriptRoot "backups")
}

$ErrorActionPreference = "Stop"

# Sanity checks ---------------------------------------------------------------
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "docker CLI not found on PATH - install Docker Desktop first."
}

$containerStatus = docker inspect --format '{{.State.Status}}' $Container 2>$null
if ($LASTEXITCODE -ne 0) {
  throw "Container '$Container' is not running. Start it with: docker compose up -d db"
}
if ($containerStatus -ne "running") {
  throw "Container '$Container' is in state '$containerStatus' (expected 'running')."
}

# Make sure the destination directory exists and is gitignored
if (-not (Test-Path $OutDir)) {
  New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
}
$gitignorePath = Join-Path $OutDir ".gitignore"
if (-not (Test-Path $gitignorePath)) {
  Set-Content -Path $gitignorePath -Value "*`n!.gitignore" -Encoding UTF8
}

# Run pg_dump inside the container ------------------------------------------
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$filename = "vortec_${Database}_${timestamp}.sql.gz"
$outPath = Join-Path $OutDir $filename

Write-Host "Backing up '$Database' from container '$Container' -> $outPath"

# Run pg_dump inside the container and stream its output through gzip
# straight to disk. Using the shell to wire up the pipe avoids the
# PowerShell ProcessStartInfo ceremony (and the .NET Framework
# stream-read quirks on Windows PowerShell 5.1).
#
# The postgres image is configured with `host all all all trust` for
# the local subnet only (see docker-compose.yml), so no password is
# required for the in-container pg_dump.

# Run pg_dump INSIDE the container, piping through busybox gzip (the
# alpine image ships with gzip) so the entire pipeline is owned by
# the container, and we just redirect the final stream to a file on
# the host. No host gzip / psql / pg_dump needed.
$cmdLine = "docker exec $Container sh -c `"pg_dump -U $User --no-owner --clean --if-exists $Database | gzip -9`" > `"$outPath`""
cmd /c $cmdLine
if ($LASTEXITCODE -ne 0) {
  throw "Backup pipeline exited with code $LASTEXITCODE"
}

$sizeMb = [math]::Round((Get-Item $outPath).Length / 1MB, 2)
Write-Host "Done. Wrote $filename ($sizeMb MB)."

# Rotation: keep the newest $Keep, delete the rest ---------------------------
$all = Get-ChildItem -Path $OutDir -Filter "vortec_${Database}_*.sql.gz" |
       Sort-Object LastWriteTime -Descending
if ($all.Count -gt $Keep) {
  $toDelete = $all | Select-Object -Skip $Keep
  foreach ($f in $toDelete) {
    Write-Host "Rotating out: $($f.Name)"
    Remove-Item $f.FullName -Force
  }
}

# Re-list AFTER rotation so the message reflects the post-rotation state
$all = Get-ChildItem -Path $OutDir -Filter "vortec_${Database}_*.sql.gz" |
       Sort-Object LastWriteTime -Descending

Write-Host "Backups retained: $($all.Count) (most recent first):"
$all | Select-Object -First 5 | ForEach-Object { Write-Host "  - $($_.Name)  ($([math]::Round($_.Length/1MB,2)) MB, $($_.LastWriteTime))" }
if ($all.Count -gt 5) { Write-Host "  ... and $($all.Count - 5) older" }
