# Development

## Local services

Run the backend on `127.0.0.1:8000` and the Vite frontend on `127.0.0.1:5173`. These values come from the tracked `forge.config.json`; Vite, Playwright and the Windows launcher read the same file. Vite proxies `/api` to the backend and E2E verifies health through that proxy. The backend defaults to the absolute repository path `.forge/data/forge.db`, independent of the current working directory, and reads `FORGE_` environment variables from the root or `backend/.env` when present.

The first migration infrastructure is in `backend/migrations` and `alembic.ini`. There are no domain tables in FND-00 yet.

## Checks

Use `scripts/test.ps1` for the full quality sequence. It validates migrations, starts both local services through the Playwright config, validates `/api/health` through Vite, checks navigation and keyboard-accessible palette behavior, and checks that theme switching does not emit browser console errors. Use `npm ci` and `uv sync --locked --dev` for reproducible installs.

`scripts/start.ps1` checks whether the configured backend port is available. If another listener responds with a non-Forge health payload, startup stops with an actionable message and does not terminate the unrelated process.

For an occupied local port, set `FORGE_BACKEND_PORT` before starting; Vite and Playwright consume the same override so the proxy and E2E health check stay aligned.

Run `uv run python scripts/audit_secrets.py` before publication. It scans the current worktree, index and every reachable Git commit for private keys and common credential literals.

Do not add provider credentials, cloud integrations or repository access to FND-00. Keep claims in the UI tied to observed backend data once those features are implemented.

