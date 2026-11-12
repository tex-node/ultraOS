# Verify the SQLite outbox: the four actions, per-key MARK_SYNCED, and the WAL settings.
#
# Prints the database straight after each step, because "the data is really in SQLite" is the entire point of this prompt.
$ErrorActionPreference = "Continue"
$exe = "C:\Users\XPS\apex-court-target\debug\ultraos-desktop.exe"
$base = "http://127.0.0.1:8012"
$origin = "https://app.neonultra.ng"
$db = Join-Path $env:APPDATA "ultraos\outbox.db"
$work = Join-Path $env:TEMP "ultraos-sqlite-test"
New-Item -ItemType Directory -Force -Path $work | Out-Null

function Write-Json([string]$path, [string]$content) {
    [System.IO.File]::WriteAllText($path, $content, (New-Object System.Text.UTF8Encoding($false)))
}

function Query([string]$sql) {
    $py = "C:\Users\XPS\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe"
    $script = Join-Path $work "q.py"
    Write-Json $script ("import sqlite3, sys`n" +
        "c = sqlite3.connect(r'$db')`n" +
        "for row in c.execute(\"\"\"" + $sql + "\"\"\"):`n" +
        "    print('  ' + ' | '.join('NULL' if v is None else str(v) for v in row))`n")
    & $py $script
}

$process = Start-Process -FilePath $exe -PassThru
Start-Sleep -Seconds 8

try {
    $headers = (curl.exe -s -D - -o NUL -H "Origin: $origin" "$base/handshake") -join "`n"
    $token = ([regex]::Match($headers, "ultraos_agent=([^;\r\n]+)")).Groups[1].Value

    function Agent([string]$action, [string]$payload = "null") {
        $file = Join-Path $work "body.json"
        Write-Json $file ('{"action":"' + $action + '","payload":' + $payload + '}')
        (curl.exe -s -X POST -H "Origin: $origin" -H "Content-Type: application/json" -H "Cookie: ultraos_agent=$token" --data-binary "@$file" "$base/api/local/agent")
    }

    Write-Output "== database file"
    Write-Output ("  {0} · exists: {1}" -f $db, (Test-Path $db))

    Write-Output "== pragmas"
    Query "PRAGMA journal_mode; PRAGMA synchronous;"

    Write-Output "== clear, then SAVE_OUTBOX x3 (one duplicate key)"
    Agent "CLEAR_OUTBOX" | Out-Null
    $records = '[{"idempotencyKey":"k-1","entityType":"GameEvent","entityId":"e1","operation":"CREATE","clientUpdatedAt":"2026-11-12T06:00:00Z","payload":{"points":2}},{"idempotencyKey":"k-2","entityType":"GameEvent","entityId":"e2","operation":"CREATE","clientUpdatedAt":"2026-11-12T06:00:01Z","payload":{"points":3}},{"idempotencyKey":"k-2","entityType":"GameEvent","entityId":"e2","operation":"CREATE","clientUpdatedAt":"2026-11-12T06:00:01Z","payload":{"points":3}}]'
    Write-Output ("  " + (Agent "SAVE_OUTBOX" $records))
    Query "SELECT idempotencyKey, attemptCount, syncedAt FROM outbox ORDER BY idempotencyKey;"

    Write-Output "== READ_OUTBOX"
    Write-Output ("  " + (Agent "READ_OUTBOX"))

    Write-Output "== MARK_SYNCED: k-1 APPLIED"
    Write-Output ("  " + (Agent "MARK_SYNCED" '{"idempotencyKeys":["k-1"],"status":"APPLIED"}'))
    Query "SELECT idempotencyKey, syncedAt IS NOT NULL AS synced, attemptCount, deadLetteredAt FROM outbox ORDER BY idempotencyKey;"

    Write-Output "== READ_OUTBOX (pending only)"
    Write-Output ("  " + (Agent "READ_OUTBOX"))

    Write-Output "== MARK_SYNCED: k-2 FAILED x5 (dead-letters at 5)"
    foreach ($i in 1..5) { Agent "MARK_SYNCED" '{"idempotencyKeys":["k-2"],"status":"FAILED","failureReason":"signature mismatch"}' | Out-Null }
    Query "SELECT idempotencyKey, attemptCount, failureReason, deadLetteredAt IS NOT NULL AS dead FROM outbox ORDER BY idempotencyKey;"

    Write-Output "== RETRY_DEAD_LETTERED"
    Write-Output ("  " + (Agent "RETRY_DEAD_LETTERED"))
    Query "SELECT idempotencyKey, attemptCount, failureReason, deadLetteredAt FROM outbox ORDER BY idempotencyKey;"

    Write-Output "== unknown action"
    Write-Output ("  " + (Agent "DELETE_EVERYTHING"))
}
finally {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
}
