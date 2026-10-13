# Forge

Forge is a local-first workspace for connecting product intent, local repositories, implementation context and delivery evidence. FND-00 is the executable bootstrap: a FastAPI health endpoint, local SQLite infrastructure and a real React app shell with useful empty states.

## Status

FND-00 is intentionally limited. There are no connected repositories, features, agent runs, CI claims or release records in the UI. Those capabilities belong to later milestones.

## Licensing

Forge is source-available. Forge code and materials for which the project rights holder owns the relevant rights are offered under the [PolyForm Noncommercial License 1.0.0](LICENSE.md). Forge is not presented as Open Source Initiative-approved software.

The Community terms do not automatically authorize commercial exploitation outside PolyForm's permitted purposes. A commercial business must obtain a separate written [Forge Commercial](COMMERCIAL-LICENSING.md) agreement before internal use for a commercial purpose or other commercial exploitation, unless the specific use is independently permitted by PolyForm. PolyForm's stated exceptions and rights recognized by law remain applicable.

Copyright and attribution details are in [NOTICE](NOTICE). Project identity guidance is in [TRADEMARKS.md](TRADEMARKS.md), contribution rules are in [CONTRIBUTING.md](CONTRIBUTING.md), and responsible disclosure guidance is in [SECURITY.md](SECURITY.md).

## Stack

- Backend: Python 3.12+, FastAPI, Pydantic Settings, SQLAlchemy 2, SQLite, Alembic, uv, pytest, ruff and mypy.
- Frontend: React, TypeScript strict, Vite, React Router, CSS variables, Vitest, React Testing Library, Playwright and ESLint.

## Run locally on Windows

Prerequisites: Python 3.12+, Node.js `24.13.0`, npm `11.6.2`, uv and Git. The Node version is recorded in `.node-version` and `.nvmrc`; the frontend package enforces the compatible Node/npm range.

```powershell
uv sync --locked --dev
Push-Location frontend
npm ci
Pop-Location
```

Run the two processes in separate terminals:

```powershell
uv run --directory backend uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

```powershell
Push-Location frontend
npm run dev -- --host 127.0.0.1
Pop-Location
```

Open `http://127.0.0.1:5173`. The API health check is available at `http://127.0.0.1:8000/api/health`.

Or use the Windows helper, which starts both processes:

```powershell
.\scripts\start.ps1 -Install
```

If the configured backend port is already used by another service, the launcher stops safely. For a local alternate port, keep the processes aligned with the same override:

```powershell
$env:FORGE_BACKEND_PORT = "8001"
.\scripts\start.ps1
```

## Verify

Backend checks:

```powershell
uv run ruff check backend
uv run mypy backend
uv run pytest
```

Frontend checks:

```powershell
Push-Location frontend
npm run lint
npm run typecheck
npm run test
npx playwright install chromium
npm run e2e
Pop-Location
```

The complete sequence is also available as `.\scripts\test.ps1`. Use `npm ci` and `uv sync --locked --dev` for clean reproducible installs.

The configured ports are kept in `forge.config.json` and are consumed by Vite, Playwright and the Windows launcher. The backend startup guard rejects an occupied port unless it responds as Forge; it never terminates an unrelated listener. Local SQLite data lives under `.forge/data/` and is independent of the current working directory.

Run `uv run python scripts/audit_secrets.py` before publication. It scans the current worktree, index and every reachable Git commit for private keys and common credential literals.

## Design reference

The implementation uses the supplied Forge Figma file as the visual reference. The accessible Core canvas is `04 — Desktop / Core` (`node-id=1:5`), with the Workspace Home at `4:32`. The shell follows the inspected graphite/copper palette, 232px sidebar, compact workspace header, rounded graphite surfaces, Geist-style type hierarchy and IBM Plex Mono labels. FND-00 replaces Figma's sample content with honest empty states; no sample projects, commits, CI results or verification claims are rendered.

## Repository layout

```text
backend/app/{domain,application,persistence,git,context,handoffs,api}
backend/migrations
backend/tests
frontend/src
frontend/e2e
docs
scripts
```

