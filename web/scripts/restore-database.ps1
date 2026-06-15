param(
  [Parameter(Mandatory = $true)]
  [string]$BackupPath,
  [Parameter(Mandatory = $true)]
  [ValidateSet("RESTORE")]
  [string]$Confirm,
  [switch]$Clean
)

$ErrorActionPreference = "Stop"

if (-not $env:DATABASE_URL) {
  throw "DATABASE_URL is required."
}

$resolvedBackup = (Resolve-Path -LiteralPath $BackupPath).Path
$checksumPath = "$resolvedBackup.sha256"
if (-not (Test-Path -LiteralPath $checksumPath)) {
  throw "Checksum file not found: $checksumPath"
}

$expected = ((Get-Content -LiteralPath $checksumPath -Raw).Trim() -split "\s+")[0]
$actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $resolvedBackup).Hash.ToLowerInvariant()
if ($expected -ne $actual) {
  throw "Backup checksum verification failed."
}

$arguments = @(
  "--dbname=$($env:DATABASE_URL)",
  "--exit-on-error",
  "--no-owner",
  "--no-privileges"
)
if ($Clean) {
  $arguments += "--clean"
  $arguments += "--if-exists"
}
$arguments += $resolvedBackup

& pg_restore @arguments
if ($LASTEXITCODE -ne 0) {
  throw "pg_restore failed with exit code $LASTEXITCODE."
}

Write-Output "Restore completed from: $resolvedBackup"
