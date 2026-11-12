# Diagnose the 401: what token did the handshake issue, and what is actually being sent back?
$ErrorActionPreference = "Continue"
$exe = "C:\Users\XPS\apex-court-target\debug\ultraos-desktop.exe"
$base = "http://127.0.0.1:8012"
$origin = "https://app.neonultra.ng"

$process = Start-Process -FilePath $exe -PassThru
Start-Sleep -Seconds 6

try {
    $h = Invoke-WebRequest -Uri "$base/handshake" -Headers @{ Origin = $origin } -UseBasicParsing
    $raw = $h.Headers["Set-Cookie"]
    Write-Output "raw Set-Cookie type: $($raw.GetType().Name)"
    Write-Output "raw Set-Cookie: $($raw -replace 'ultraos_agent=[^;]+','ultraos_agent=<redacted>')"
    $joined = if ($raw -is [array]) { $raw -join "; " } else { [string]$raw }
    $token = ([regex]::Match($joined, "ultraos_agent=([^;]+)")).Groups[1].Value
    Write-Output "token length: $($token.Length)"

    $headers = @{ "Content-Type" = "application/json"; "Origin" = $origin; "Cookie" = "ultraos_agent=$token" }
    try {
        $r = Invoke-RestMethod -Uri "$base/api/local/agent" -Method Post -Headers $headers -Body '{"action":"PING"}'
        Write-Output "PING ok: $($r | ConvertTo-Json -Compress)"
    } catch {
        Write-Output "PING failed: $([int]$_.Exception.Response.StatusCode) $($_.ErrorDetails.Message)"
    }

    # Second handshake: does the token change between calls? (It must not.)
    $h2 = Invoke-WebRequest -Uri "$base/handshake" -Headers @{ Origin = $origin } -UseBasicParsing
    $raw2 = $h2.Headers["Set-Cookie"]
    $joined2 = if ($raw2 -is [array]) { $raw2 -join "; " } else { [string]$raw2 }
    $token2 = ([regex]::Match($joined2, "ultraos_agent=([^;]+)")).Groups[1].Value
    Write-Output "second token identical: $($token -eq $token2) (len $($token2.Length))"
}
finally {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
}
