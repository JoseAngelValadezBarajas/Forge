# Development

For current module ownership and dependency rules, see the [architecture index](architecture/README.md). The [engineering checks guide](engineering/testing.md) is the canonical reference for the complete backend/frontend quality sequence and visual-baseline policy.

The Windows Desktop Alpha uses the same product contracts with a Rust-owned authenticated local API bridge and per-user SQLite under `%LOCALAPPDATA%\Forge`. Its separate toolchain, build, data-preservation and installed-product acceptance steps are in the [DESK-01 Windows guide](desktop/desk-01-windows-alpha.md). Do not use the developer `.forge/data/forge.db` as desktop smoke-test data.

## Local services

Run the backend on `127.0.0.1:8000` and the Vite frontend on `127.0.0.1:5173`. These values come from the tracked `forge.config.json`; Vite, Playwright and the Windows launcher read the same file. Vite proxies `/api` to the backend and E2E verifies health through that proxy. The backend defaults to the absolute repository path `.forge/data/forge.db`, independent of the current working directory, and reads `FORGE_` environment variables from the root or `backend/.env` when present.

The opt-in local distribution mode serves the production frontend build and the same API from one HTTP origin. Build once, then start it with:

```powershell
Push-Location frontend
npm run build
Pop-Location
$env:FORGE_RUNTIME_MODE = "local"
uv run --directory backend python -m app.local_runtime
```

Open the printed/configured loopback origin (by default `http://127.0.0.1:8000`). This serving process does not start Vite or Node. `FORGE_RUNTIME_HOST` accepts only a literal loopback IP (`127.0.0.1` or `::1`); `FORGE_RUNTIME_PORT` selects its port, and `FORGE_FRONTEND_DIST_DIR` may point to a packaged build directory containing `index.html` and compiled `assets`. The frontend build is checked at startup. `/api` remains API-only; missing API routes and missing assets return 404, while the SPA fallback is reserved for browser document navigation. The development workflow and its Vite proxy are unchanged.

In local runtime mode, every HTTP request must have exactly one valid `Host` header for the configured literal loopback address and HTTP port. Starlette `TrustedHostMiddleware` restricts the host, and local validation checks the port and rejects missing or duplicate Host fields. This helps prevent DNS rebinding; it is not authentication. Mutations also require the exact configured same-origin `Origin`. Forwarded headers do not override either check. Other local processes can forge headers or call loopback endpoints directly, so do not expose this mode to a network interface. The existing `.forge/data/forge.db` location, URL resolution and migration history are unchanged; migrations remain explicit and must be applied before first use. Do not point certification tests at a developer database.

The migration infrastructure is in `backend/migrations` and `alembic.ini`. Run `uv run alembic upgrade head` followed by `uv run --directory backend python -m app.initialization` after a fresh checkout. The initializer is explicit and idempotent: it creates `Local Workspace` once, and does not run on module import.

The API contract is summarized in [`api-contracts.md`](api-contracts.md). Workspace, project and planning IDs are opaque UUID strings; feature readable IDs are stable per project. Project names are unique case-insensitively within a workspace, archive is reversible, and an archived project is read-only for planning and FND-04 mutations. The Context Package schema is documented in [`context-schema.md`](context-schema.md).

FND-05 run and handoff behavior is documented in [`fnd05-runs-handoffs.md`](fnd05-runs-handoffs.md). Its migration is applied by `uv run alembic upgrade head`; do not create run records with `create_all`. The Workbench E2E suite starts an isolated backend with a temporary SQLite file. If port 8000 is occupied by another process, use aligned `FORGE_BACKEND_PORT` and `FORGE_FRONTEND_PORT` overrides; the runner fails safely rather than reusing or modifying an existing server.

FND-06 evidence, provenance, verification rules, release gates and manifest limitations are documented in [`product/fnd06-evidence-and-releases.md`](product/fnd06-evidence-and-releases.md), with routes in [`product/fnd06-api-contracts.md`](product/fnd06-api-contracts.md). E2E uses a temporary SQLite database and never fetches references or reads artifact paths.

## Checks

Use `scripts/test.ps1` for the full quality sequence. It validates migrations, starts isolated local services through the Playwright config, validates `/api/health` through Vite, checks navigation and keyboard-accessible palette behavior, and checks that theme switching does not emit browser console errors. The detailed commands, coverage gates, temporary-database rules and visual regression process are maintained in [engineering/testing](engineering/testing.md). Use `npm ci` and `uv sync --locked --dev` for reproducible installs.

`scripts/start.ps1` checks whether the configured backend port is available. If another listener responds with a non-Forge health payload, startup stops with an actionable message and does not terminate the unrelated process.

For an occupied local port, set `FORGE_BACKEND_PORT` before starting; Vite and Playwright consume the same override so the proxy and E2E health check stay aligned.

Run `uv run python scripts/audit_secrets.py` before publication. It scans every commit reachable by the local Git references, the index and tracked or non-ignored untracked working-tree files using Python's regular-expression engine. It redacts matched values, skips binary files and does not follow symlinks, reporting both counts. Ignored generated files are outside its coverage by design. Git, file-read and pattern errors return an explicit error status; they are never treated as a clean scan.

Licensing documents live at the repository root: `LICENSE.md`, `NOTICE`, `COMMERCIAL-LICENSING.md`, `TRADEMARKS.md`, `CONTRIBUTING.md` and `SECURITY.md`. The third-party dependency inventory is in `docs/dependency-licenses.md`.

FND-04 repository access is local and read-only. The observer must not fetch, push, commit, checkout, merge, reset, execute arbitrary commands, invoke hooks, inspect remotes or read source files. Git subprocesses use list arguments without a shell, a controlled environment, bounded concurrent stdout/stderr readers, explicit timeouts and process cleanup. Keep claims in the UI tied to observed backend data; manual planning states, readiness, Git observations and later delivery evidence remain distinct.

Repository paths must resolve beneath an approved local root. By default, Forge approves the current user's home directory and the Forge installation directory. To approve other repository locations, set `FORGE_ALLOWED_REPOSITORY_ROOTS` to a JSON array of existing absolute directories in the root or `backend/.env`, for example `FORGE_ALLOWED_REPOSITORY_ROOTS=["C:\\Dev","D:\\Work"]` on Windows or `FORGE_ALLOWED_REPOSITORY_ROOTS=["/work","/mnt/projects"]` on Linux. Paths are canonicalized before a separator-aware containment check; symlinks resolving outside an approved root are rejected. The current policy is checked both when a connection is created and immediately before each new Git observation. Therefore, changing the allowlist can temporarily prevent observations of existing connections; their connection and observation history remains readable and unchanged. To restore observation access, add the intended existing directory to the JSON array of explicitly trusted roots and restart/reload the local configuration. Forge does not approve the whole filesystem by default.

