# Development

## Local services

Run the backend on `127.0.0.1:8000` and the Vite frontend on `127.0.0.1:5173`. These values come from the tracked `forge.config.json`; Vite, Playwright and the Windows launcher read the same file. Vite proxies `/api` to the backend and E2E verifies health through that proxy. The backend defaults to the absolute repository path `.forge/data/forge.db`, independent of the current working directory, and reads `FORGE_` environment variables from the root or `backend/.env` when present.

The migration infrastructure is in `backend/migrations` and `alembic.ini`. Run `uv run alembic upgrade head` followed by `uv run --directory backend python -m app.initialization` after a fresh checkout. The initializer is explicit and idempotent: it creates `Local Workspace` once, and does not run on module import.

The API contract is summarized in [`api-contracts.md`](api-contracts.md). Workspace, project and planning IDs are opaque UUID strings; feature readable IDs are stable per project. Project names are unique case-insensitively within a workspace, archive is reversible, and an archived project is read-only for planning and FND-04 mutations. The Context Package schema is documented in [`context-schema.md`](context-schema.md).

FND-05 run and handoff behavior is documented in [`fnd05-runs-handoffs.md`](fnd05-runs-handoffs.md). Its migration is applied by `uv run alembic upgrade head`; do not create run records with `create_all`. The Workbench E2E suite starts an isolated backend with a temporary SQLite file. If port 8000 is occupied by another process, use aligned `FORGE_BACKEND_PORT` and `FORGE_FRONTEND_PORT` overrides; the runner fails safely rather than reusing or modifying an existing server.

FND-06 evidence, provenance, verification rules, release gates and manifest limitations are documented in [`product/fnd06-evidence-and-releases.md`](product/fnd06-evidence-and-releases.md), with routes in [`product/fnd06-api-contracts.md`](product/fnd06-api-contracts.md). E2E uses a temporary SQLite database and never fetches references or reads artifact paths.

## Checks

Use `scripts/test.ps1` for the full quality sequence. It validates migrations, starts both local services through the Playwright config, validates `/api/health` through Vite, checks navigation and keyboard-accessible palette behavior, and checks that theme switching does not emit browser console errors. Use `npm ci` and `uv sync --locked --dev` for reproducible installs.

`scripts/start.ps1` checks whether the configured backend port is available. If another listener responds with a non-Forge health payload, startup stops with an actionable message and does not terminate the unrelated process.

For an occupied local port, set `FORGE_BACKEND_PORT` before starting; Vite and Playwright consume the same override so the proxy and E2E health check stay aligned.

Run `uv run python scripts/audit_secrets.py` before publication. It scans every commit reachable by the local Git references, the index and tracked or non-ignored untracked working-tree files using Python's regular-expression engine. It redacts matched values, skips binary files and does not follow symlinks, reporting both counts. Ignored generated files are outside its coverage by design. Git, file-read and pattern errors return an explicit error status; they are never treated as a clean scan.

Licensing documents live at the repository root: `LICENSE.md`, `NOTICE`, `COMMERCIAL-LICENSING.md`, `TRADEMARKS.md`, `CONTRIBUTING.md` and `SECURITY.md`. The third-party dependency inventory is in `docs/dependency-licenses.md`.

FND-04 repository access is local and read-only. The observer must not fetch, push, commit, checkout, merge, reset, execute arbitrary commands, invoke hooks, inspect remotes or read source files. Git subprocesses use list arguments without a shell, a controlled environment, bounded concurrent stdout/stderr readers, explicit timeouts and process cleanup. Keep claims in the UI tied to observed backend data; manual planning states, readiness, Git observations and later delivery evidence remain distinct.

