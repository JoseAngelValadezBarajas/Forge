# Development

## Local services

Run the backend on `127.0.0.1:8000` and the Vite frontend on `127.0.0.1:5173`. Vite proxies `/api` to the backend. The backend defaults to `sqlite:///./forge.db` and reads `FORGE_` environment variables from `backend/.env` when present.

The first migration infrastructure is in `backend/migrations` and `alembic.ini`. There are no domain tables in FND-00 yet.

## Checks

Use `scripts/test.ps1` for the full quality sequence. The Playwright config starts both local services, validates `/api/health`, checks navigation and checks that theme switching does not emit browser console errors.

Do not add provider credentials, cloud integrations or repository access to FND-00. Keep claims in the UI tied to observed backend data once those features are implemented.

