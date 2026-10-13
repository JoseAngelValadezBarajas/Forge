# Forge

Forge is a local-first workspace for connecting product intent, local repositories, implementation context and delivery evidence. FND-00 is the executable bootstrap: a FastAPI health endpoint, local SQLite infrastructure and a real React app shell with useful empty states.

## Status

FND-00 is intentionally limited. There are no connected repositories, features, agent runs, CI claims or release records in the UI. Those capabilities belong to later milestones.

## Stack

- Backend: Python 3.12+, FastAPI, Pydantic Settings, SQLAlchemy 2, SQLite, Alembic, uv, pytest, ruff and mypy.
- Frontend: React, TypeScript strict, Vite, React Router, CSS variables, Vitest, React Testing Library, Playwright and ESLint.

## Run locally on Windows

Prerequisites: Python 3.12+, Node.js 20+, npm, uv and Git.

```powershell
uv sync --dev
Push-Location frontend
npm install
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

## Verify

Backend checks:

```powershell
uv run ruff check backend
uv run mypy backend/app
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

The complete sequence is also available as `.\scripts\test.ps1`.

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

