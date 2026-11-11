# Load web/.env.test into the current PowerShell session, then run whatever command is passed.
# Usage: .\scripts\test-env.ps1 { npx prisma migrate deploy }
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Command)

$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root "web\.env.test"
foreach ($line in Get-Content -LiteralPath $envFile) {
    if ($line -match '^\s*([A-Z0-9_]+)=(.*)$') {
        $name = $Matches[1]
        $value = $Matches[2].Trim('"')
        Set-Item -Path "Env:$name" -Value $value
    }
}
Push-Location (Join-Path $root "web")
try {
    & $Command[0] @($Command[1..($Command.Count - 1)])
} finally {
    Pop-Location
}
