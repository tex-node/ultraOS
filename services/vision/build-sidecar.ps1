# Build the desktop vision sidecar (5c-ii-c).
#
# Fails closed on the weights: the pinned SHA256 in weights.sha256 must match the file on disk, or nothing is bundled. A build that
# ships an unpinned model is not reproducible, and "it downloaded once" is not a provenance story.
#
# Usage:  .\build-sidecar.ps1
$ErrorActionPreference = "Stop"

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

$python = Join-Path $here ".venv-sidecar\Scripts\python.exe"
if (-not (Test-Path $python)) {
    throw "missing .venv-sidecar - create it and install requirements-sidecar.txt first"
}

# 1. verify the weights against the pinned hash
$weights = Join-Path $here "weights\yolov8n.pt"
$pinned = ((Get-Content (Join-Path $here "weights.sha256") -Raw).Trim() -split '\s+')[0].ToLower()
if (-not (Test-Path $weights)) { throw "missing weights\$([IO.Path]::GetFileName($weights))" }
$actual = (Get-FileHash $weights -Algorithm SHA256).Hash.ToLower()
if ($actual -ne $pinned) {
    throw "weights hash mismatch: pinned $pinned, file $actual - refusing to build"
}
Write-Host "weights ok: $actual"

# 2. PyInstaller must be present in the venv (it is a build tool, not a runtime dep)
& $python -c "import PyInstaller" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "installing pyinstaller..."
    & $python -m pip install "pyinstaller==6.11.1" --quiet
}

# 3. build
Write-Host "building one-file bundle..."
& $python -m PyInstaller sidecar.spec --noconfirm --clean
if ($LASTEXITCODE -ne 0) { throw "pyinstaller failed with exit code $LASTEXITCODE" }

$exe = Join-Path $here "dist\ultraos-vision-engine.exe"
if (-not (Test-Path $exe)) { throw "build finished but $exe is missing" }

$bytes = (Get-Item $exe).Length
$sha = (Get-FileHash $exe -Algorithm SHA256).Hash.ToLower()
Write-Host ""
Write-Host ("built: {0}" -f $exe)
Write-Host ("size:  {0:N0} bytes ({1:N1} MB)" -f $bytes, ($bytes / 1MB))
Write-Host ("sha256: {0}" -f $sha)
Write-Host ("free disk: {0:N2} GB" -f ((Get-PSDrive C).Free / 1GB))
