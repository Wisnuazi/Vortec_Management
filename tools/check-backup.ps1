# Verifies a backup file is a valid gzip and shows the first lines of
# the decompressed SQL. Used by the developer when smoke-testing the
# backup script; not part of the regular workflow.

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string] $BackupFile
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $BackupFile)) {
  throw "Backup file not found: $BackupFile"
}

# gzip magic header is 1F 8B
$bytes = [System.IO.File]::ReadAllBytes($BackupFile)
if ($bytes.Length -lt 2 -or $bytes[0] -ne 0x1F -or $bytes[1] -ne 0x8B) {
  throw "Not a valid gzip file (missing 1F 8B magic): $BackupFile"
}
Write-Host "OK: gzip magic 1F 8B found, size = $([math]::Round($bytes.Length / 1MB, 2)) MB"

# Decompress and show the first ~10 lines of the SQL stream
$input  = [System.IO.File]::OpenRead($BackupFile)
$gzip   = New-Object System.IO.Compression.GZipStream($input, [System.IO.Compression.CompressionMode]::Decompress)
$reader = New-Object System.IO.StreamReader($gzip)
$shown  = 0
while ($shown -lt 12) {
  $line = $reader.ReadLine()
  if ($null -eq $line) { break }
  Write-Host $line
  $shown++
}
$reader.Close()
$gzip.Close()
$input.Close()
