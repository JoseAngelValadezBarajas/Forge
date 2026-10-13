param(
  [switch]$Install
)

$ErrorActionPreference = "Stop"
$ForgeRoot = Split-Path -Parent $PSScriptRoot

if ($Install) {
  Push-Location $ForgeRoot
  uv sync --dev
  Pop-Location
  Push-Location (Join-Path $ForgeRoot "frontend")
  npm install
  Pop-Location
}

Write-Host "Starting Forge backend on http://127.0.0.1:8000"
Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-Command",
  "Set-Location '$ForgeRoot\backend'; uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"
) -WindowStyle Normal

Write-Host "Starting Forge frontend on http://127.0.0.1:5173"
Set-Location (Join-Path $ForgeRoot "frontend")
npm run dev -- --host 127.0.0.1

