# Verify the local agent: handshake, token enforcement, the four allow-listed actions, and CORS.
# Uses curl.exe because PowerShell's Invoke-RestMethod silently drops a custom Cookie header (the first version of this script
# reported 401 for a token that was actually fine).
$ErrorActionPreference = "Continue"
$exe = "C:\Users\XPS\apex-court-target\debug\ultraos-desktop.exe"
$base = "http://127.0.0.1:8012"
$origin = "https://app.neonultra.ng"
$work = Join-Path $env:TEMP "ultraos-agent-test"
New-Item -ItemType Directory -Force -Path $work | Out-Null

function Write-Json([string]$path, [string]$content) {
    [System.IO.File]::WriteAllText($path, $content, (New-Object System.Text.UTF8Encoding($false)))
}

$process = Start-Process -FilePath $exe -PassThru
Start-Sleep -Seconds 6

try {
    Write-Output "== handshake"
    $headers = (curl.exe -s -D - -o NUL -H "Origin: $origin" "$base/handshake") -join "`n"
    $token = ([regex]::Match($headers, "ultraos_agent=([^;\r\n]+)")).Groups[1].Value
    $cookieLine = ([regex]::Match($headers, "Set-Cookie: (.*)")).Groups[1].Value
    Write-Output "  status: $([regex]::Match($headers, 'HTTP/\S+ (\d+)').Groups[1].Value)"
    Write-Output "  cookie: $($cookieLine -replace 'ultraos_agent=[^;]+', 'ultraos_agent=<redacted>')"
    Write-Output "  token length: $($token.Length)"

    function Call([string]$action, [bool]$withCookie, [string]$payload = "null") {
        $file = Join-Path $work "body.json"
        Write-Json $file ('{"action":"' + $action + '","payload":' + $payload + '}')
        $args = @("-s", "-w", "HTTP %{http_code}", "-X", "POST", "-H", "Origin: $origin",
                  "-H", "Content-Type: application/json", "--data-binary", "@$file")
        if ($withCookie) { $args += @("-H", "Cookie: ultraos_agent=$token") }
        $args += "$base/api/local/agent"
        (curl.exe @args) -join " "
    }

    Write-Output "== unauthorised (no cookie, malformed body)"
    $bad = Join-Path $work "bad.json"; Write-Json $bad "not json"
    (curl.exe -s -w "HTTP %{http_code}" -X POST -H "Origin: $origin" -H "Content-Type: application/json" --data-binary "@$bad" "$base/api/local/agent") -join " "

    Write-Output "== PING";            Call "PING" $true
    Write-Output "== SAVE_OUTBOX";     Call "SAVE_OUTBOX" $true '[{"id":"a1","kind":"SCORE"},{"id":"a2","kind":"SCORE"}]'
    Write-Output "== READ_OUTBOX";     Call "READ_OUTBOX" $true
    Write-Output "== CLEAR_OUTBOX";    Call "CLEAR_OUTBOX" $true
    Write-Output "== READ (cleared)";  Call "READ_OUTBOX" $true
    Write-Output "== unknown action";  Call "DELETE_EVERYTHING" $true

    Write-Output "== CORS preflight from the allowed origin"
    (curl.exe -s -D - -o NUL -X OPTIONS -H "Origin: $origin" -H "Access-Control-Request-Method: POST" "$base/api/local/agent") -join "`n" |
        Select-String -Pattern "Access-Control-Allow-Origin|Access-Control-Allow-Credentials|HTTP/" | ForEach-Object { "  $($_.Line.Trim())" }

    Write-Output "== CORS from a foreign origin (must not echo the origin)"
    (curl.exe -s -D - -o NUL -X OPTIONS -H "Origin: https://evil.example" -H "Access-Control-Request-Method: POST" "$base/api/local/agent") -join "`n" |
        Select-String -Pattern "Access-Control-Allow-Origin|HTTP/" | ForEach-Object { "  $($_.Line.Trim())" }
}
finally {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
}
