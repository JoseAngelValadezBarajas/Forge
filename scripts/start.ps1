param(
  [switch]$Install
)

$ErrorActionPreference = "Stop"
$ForgeRoot = Split-Path -Parent $PSScriptRoot
$ForgeConfig = Get-Content (Join-Path $ForgeRoot "forge.config.json") -Raw | ConvertFrom-Json
$BackendPort = if ($env:FORGE_BACKEND_PORT) { [int]$env:FORGE_BACKEND_PORT } else { [int]$ForgeConfig.backendPort }
$FrontendPort = if ($env:FORGE_FRONTEND_PORT) { [int]$env:FORGE_FRONTEND_PORT } else { [int]$ForgeConfig.frontendPort }
$BackendBaseUrl = "http://$($ForgeConfig.host):$BackendPort"
$FrontendBaseUrl = "http://$($ForgeConfig.host):$FrontendPort"

if ($Install) {
  Push-Location $ForgeRoot
  uv sync --locked --dev
  Pop-Location
  Push-Location (Join-Path $ForgeRoot "frontend")
  npm ci
  Pop-Location
}

Push-Location $ForgeRoot
uv run alembic upgrade head
uv run --directory backend python -m app.initialization | Out-Null
Pop-Location

$existingListener = Get-NetTCPConnection -LocalAddress $ForgeConfig.host -LocalPort $BackendPort -State Listen -ErrorAction SilentlyContinue
if ($existingListener) {
  try {
    $health = Invoke-RestMethod "$BackendBaseUrl/api/health" -TimeoutSec 2
    if ($health.service -ne "Forge" -or $health.status -ne "ok") {
      throw "Unexpected health payload"
    }
    Write-Host "Reusing healthy Forge backend on $BackendBaseUrl"
  } catch {
    throw "Backend port $BackendPort is occupied, but the listener is not Forge. Stop the unrelated service, set FORGE_BACKEND_PORT, or change forge.config.json. No process was terminated."
  }
} else {
  Write-Host "Starting Forge backend on $BackendBaseUrl"
  $backendCommand = "Set-Location '$ForgeRoot\backend'; uv run uvicorn app.main:app --reload --host $($ForgeConfig.host) --port $BackendPort"
  Start-Process powershell -ArgumentList @("-NoExit", "-Command", $backendCommand) -WindowStyle Normal | Out-Null

  $backendReady = $false
  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    Start-Sleep -Milliseconds 250
    try {
      $health = Invoke-RestMethod "$BackendBaseUrl/api/health" -TimeoutSec 2
      if ($health.service -eq "Forge" -and $health.status -eq "ok") {
        $backendReady = $true
        break
      }
    } catch {
      # The child process is still starting.
    }
  }
  if (-not $backendReady) {
    throw "Forge backend did not become healthy at $BackendBaseUrl/api/health within 10 seconds."
  }
}

Write-Host "Starting Forge frontend on $FrontendBaseUrl"
Set-Location (Join-Path $ForgeRoot "frontend")
npm run dev -- --host $ForgeConfig.host

