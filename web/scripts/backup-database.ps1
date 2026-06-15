param(
  [string]$OutputDirectory = $env:ULTRA_BACKUP_DIR,
  [int]$RetentionDays = 14
)

$ErrorActionPreference = "Stop"

if (-not $env:DATABASE_URL) {
  throw "DATABASE_URL is required."
}
if (-not $OutputDirectory) {
  $OutputDirectory = Join-Path $PSScriptRoot "..\backups"
}

$resolvedOutput = [System.IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Force -Path $resolvedOutput | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupPath = Join-Path $resolvedOutput "ultraos-$timestamp.dump"
$checksumPath = "$backupPath.sha256"

& pg_dump --dbname=$env:DATABASE_URL --format=custom --compress=9 --file=$backupPath
if ($LASTEXITCODE -ne 0) {
  throw "pg_dump failed with exit code $LASTEXITCODE."
}

$checksum = (Get-FileHash -Algorithm SHA256 -LiteralPath $backupPath).Hash.ToLowerInvariant()
"$checksum  $([System.IO.Path]::GetFileName($backupPath))" |
  Set-Content -LiteralPath $checksumPath -Encoding ascii

$cutoff = (Get-Date).AddDays(-$RetentionDays)
Get-ChildItem -LiteralPath $resolvedOutput -File |
  Where-Object {
    $_.LastWriteTime -lt $cutoff -and
    ($_.Name -like "ultraos-*.dump" -or $_.Name -like "ultraos-*.dump.sha256")
  } |
  Remove-Item -Force

Write-Output "Backup created: $backupPath"
Write-Output "SHA256: $checksum"
