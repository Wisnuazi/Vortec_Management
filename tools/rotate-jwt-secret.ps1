<#
  Vortec Management - JWT secret rotation
  ----------------------------------------
  Generates a new cryptographically random JWT secret, writes it to
  `backend/.env` (replacing the old `JWT_SECRET=` line in place), and
  prints a reminder that every user must re-login.

  Effect of rotating the secret: every existing JWT signed with the
  old secret becomes invalid on the next request, so every browser
  gets a 401 from `/api/auth/me` and is bounced to /login. This is
  the intended behavior - use it when:
    - a team member with access to the old secret has left
    - the secret was committed by mistake (see CLAUDE.md section 11)
    - on a routine schedule (recommended: at least annually)

  Usage (from the repo root, in PowerShell):
    powershell -File tools/rotate-jwt-secret.ps1                # generate + write
    powershell -File tools/rotate-jwt-secret.ps1 -DryRun        # show what would change

  After running, restart the backend (or run `docker compose restart
  backend`) so the new secret is picked up - `dotenv` only reads
  `.env` once at process start.

  This script does NOT rotate the database user password (`vortec`),
  nor the super admin's bcrypt password - those are separate, see
  docs/SECURITY.md.
#>

[CmdletBinding()]
param(
  [switch] $DryRun,
  [string] $EnvPath
)

# Resolve the script's own directory robustly (see backup-db.ps1 for
# the same pattern).
if (-not $PSScriptRoot) {
  $PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
}
if (-not $EnvPath) {
  $EnvPath = (Join-Path $PSScriptRoot ".." "backend" ".env")
}

$ErrorActionPreference = "Stop"

$resolved = Resolve-Path -Path $EnvPath -ErrorAction SilentlyContinue
if (-not $resolved) {
  throw ".env not found at '$EnvPath' - copy backend/.env.example to backend/.env first."
}
$envPath = $resolved.Path

$content = Get-Content -Path $envPath -Raw
if ($content -notmatch '(?m)^JWT_SECRET=(.*)$') {
  throw "No JWT_SECRET line found in $envPath - the file may be malformed."
}

# Generate a fresh 48-byte base64url-encoded secret
$newSecret = [Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 })) -replace '\+','-' -replace '/','_' -replace '='
$oldLine = ($content | Select-String -Pattern '^JWT_SECRET=.*$').Line
$newLine = "JWT_SECRET=$newSecret"
$newContent = $content -replace [regex]::Escape($oldLine), $newLine

if ($DryRun) {
  Write-Host "DRY RUN - no files modified."
  Write-Host "  old: $oldLine"
  Write-Host "  new: $newLine"
  return
}

# Backup the previous .env (kept alongside, gitignored)
$backup = "$envPath.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Copy-Item $envPath $backup
Write-Host "Backed up previous .env -> $backup"

Set-Content -Path $envPath -Value $newContent -Encoding UTF8 -NoNewline
Write-Host "Wrote new JWT_SECRET to $envPath"

Write-Host ""
Write-Host "NEXT STEPS:"
Write-Host "  1. Restart the backend so the new secret takes effect:"
Write-Host "       docker compose restart backend"
Write-Host "       (or, if running via npm run dev, Ctrl-C and re-run)"
Write-Host ""
Write-Host "  2. Every logged-in user will be bounced to /login on their"
Write-Host "     next request - that is intended. Communicate this to the"
Write-Host "     team before the restart."
Write-Host ""
Write-Host "  3. The previous .env was copied to $backup; delete it once"
Write-Host "     you have confirmed the new secret works."
