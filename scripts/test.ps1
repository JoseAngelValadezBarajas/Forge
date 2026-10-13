$ErrorActionPreference = "Stop"
$ForgeRoot = Split-Path -Parent $PSScriptRoot

Push-Location $ForgeRoot
uv run alembic upgrade head
uv run ruff check backend
uv run mypy backend
uv run pytest
uv run python scripts/audit_secrets.py
Pop-Location

Push-Location (Join-Path $ForgeRoot "frontend")
npm run lint
npm run typecheck
npm run test
npx playwright install chromium
npm run e2e
Pop-Location

