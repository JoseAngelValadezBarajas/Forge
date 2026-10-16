# Forge Internal Alpha Readiness (ALPHA-01)

This guide records the validated local operating path for the Planning and Delivery MVP. It is an internal-alpha checklist, not a production-readiness claim or a promise of support for untested operating systems.

## Validated environment and install

The documented operator path is Windows 11 with Python 3.12, uv, Node.js `24.13.0`, npm `11.6.2`, Git, and PowerShell. Linux is exercised by GitHub Actions; that CI result alone is not a claim that every Linux desktop setup has been user-validated. Use the pinned Node/npm values in `.node-version`, `.nvmrc`, and `frontend/package.json`.

From a clean clone, install and initialize:

```powershell
uv sync --locked --dev
uv run alembic upgrade head
uv run --directory backend python -m app.initialization
Push-Location frontend
npm ci
Pop-Location
```

Start the backend and frontend in separate PowerShell terminals using the commands in the root README. Check `GET http://127.0.0.1:8000/api/health`, select the initialized Local Workspace, then create a Project from Projects. The standard local database is `.forge/data/forge.db` under the Forge project root, independent of the shell's current directory. Do not commit it; local database files are ignored by Git.

To exercise first-run setup without touching a developer database, choose a fresh temporary directory and pass the same absolute SQLite URL to migration, initialization, and backend startup. For example:

```powershell
$smokeRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("forge-alpha-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $smokeRoot | Out-Null
$smokeDatabase = Join-Path $smokeRoot "forge.db"
$env:FORGE_DATABASE_URL = "sqlite:///" + ($smokeDatabase -replace '\\', '/')
uv run alembic upgrade head
uv run --directory backend python -m app.initialization
uv run --directory backend uvicorn app.main:app --host 127.0.0.1 --port 8000
```

In another terminal, request `/api/health` and use the browser to create a Project. Set `FORGE_DATABASE_URL` to the same path in both terminals. Pick an unused backend port and align `FORGE_BACKEND_PORT` with `forge.config.json`/the frontend proxy when using a non-default port. Stop only the Forge process started for this smoke run. Remove the temporary directory only after verifying its resolved path is the unique `forge-alpha-*` directory created above; never point this procedure at `.forge/data/forge.db`.

## Internal alpha smoke checklist

Run the full, isolated browser journey with `npm run e2e`. The runner owns a fresh temporary SQLite database and temporary repositories, migrates and seeds them, starts its own API and Vite servers, and cleans its resources at completion. Do not run a second Forge server on its configured ports at the same time. The existing Chromium journeys cover:

- First-run Workspace, Project creation, project overview, navigation, and reload persistence.
- Epics, Features, Tasks, Acceptance Criteria, dependencies, Board/Inventory, Decisions, Invariants, acknowledgement revisions, and readiness preview/history/staleness.
- Optional local repository observation, context packages, declared Runs and Handoffs, evidence, verification rules, and release-candidate gates.
- Project archive/restore behavior and workspace isolation.

The backend restart regression independently creates a Workspace, Project, and Feature in a temporary migrated SQLite database, stops only its owned Uvicorn process, starts a second process against the same database, and reads those records back. It never uses the default local database.

The current visual references cover 19 dark desktop screens, 4 light desktop screens, and 6 mobile screens. Mobile Board horizontal scrolling is intentional inside the Board; the page itself must not acquire horizontal overflow. Playwright retries remain disabled. Failed tests retain traces under ignored `frontend/test-results/`; passing tests do not retain traces. Candidate screenshots are written to ignored `frontend/artifacts/rfx-org-03b/candidate/` for review and do not replace approved snapshots automatically.

## Local validation evidence (2026-10-16)

Validated on Windows 11 Pro build 26300, Python 3.12.10, uv 0.12.7, Node.js 24.13.0, and npm 11.6.2:

- `uv sync --locked --dev` and `npm ci` completed. npm audited 250 packages with zero reported vulnerabilities; `npm audit --audit-level=low` also reported zero. The repository currently has zero open Dependabot alerts. No dependency or lockfile was changed.
- Ruff, strict mypy (90 application source files), and the backend architecture checker passed. Pytest: 91 passed, 2 skipped. Both skips are directory-symlink tests that Windows could not create under this account; Linux CI must run those paths. Four non-failing upstream deprecation warnings came from Starlette/httpx TestClient and Alembic's legacy `prepend_sys_path` parsing.
- Frontend ESLint and TypeScript passed. Vitest: 181 passed. The Node architecture/runner/API-verifier/contrast checks: 20 passed; OpenAPI request and response contracts: 94/94 each. Production Vite build passed. Line coverage is 71.4% (1,401/1,962), unchanged from the established gate.
- Chromium visual suite passed 29 references: 19 dark desktop references were not modified; the 4 light desktop and 6 mobile references were reviewed and updated for the intentional `--text-subtle` color change. Desktop and mobile geometry was preserved, including internal Board scrolling.
- Chromium behavior suite: 13 passed against temporary SQLite and API servers. The only recorded HTTP 422 is the required rejection of saving readiness for an archived project; the test confirms its read-only explanation and no unexpected console errors.
- `npm run test:isolation` passed its negative case: a pre-existing server on the probe port received no writes. An isolated intentional failure retained a Playwright trace under ignored `frontend/test-results`; its passing control test produced no trace.
- Light Mode `--text-subtle` contrast from the actual CSS tokens: `--bg` 5.74:1, `--surface-sidebar` 5.24:1, `--surface` 6.26:1, `--surface-interactive` 5.10:1, `--surface-raised` 6.59:1, and `--surface-tag` 4.92:1. The negative regression rejects an inadequate contrast value.

The full GitHub Actions/CodeQL result for this release branch is recorded with the Draft PR; local results are not a substitute for remote CI.

## Local data backup and restore

Forge stores its default SQLite database at `.forge/data/forge.db`. Treat it as user data. Keep backups outside the repository, in a directory private to the current OS account (for example `%LOCALAPPDATA%\Forge\backups` on Windows). Never add a database or backup to Git, and do not copy a live SQLite file directly: the database may be using a write-ahead log.

Use Python's SQLite online backup API. It takes a transactionally consistent snapshot while Forge is running. Supply explicit source and new destination paths; the example refuses to overwrite an existing backup. Run from the repository root:

```powershell
$sourceDb = (Resolve-Path ".forge/data/forge.db").Path
$backupDir = Join-Path $env:LOCALAPPDATA "Forge/backups"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
$backupDb = Join-Path $backupDir ("forge-{0}.db" -f (Get-Date -Format "yyyyMMdd-HHmmss-fff"))
$backupCode = @'
import os, sqlite3, sys
source, destination = sys.argv[1:]
if os.path.exists(destination): raise SystemExit("Refusing to overwrite an existing backup")
with sqlite3.connect(source) as src, sqlite3.connect(destination) as dst: src.backup(dst)
with sqlite3.connect(destination) as check:
    if check.execute("PRAGMA integrity_check").fetchone() != ("ok",): raise SystemExit("Backup integrity check failed")
if os.name != "nt": os.chmod(destination, 0o600)
'@
uv run python -c $backupCode $sourceDb $backupDb
```

On Windows, keep the backup under the current user's private profile and leave inherited ACLs intact; do not broaden access. On POSIX, the command sets mode `0600`. Record the backup path securely. Verify a restore into a *new, separate* destination, never over the source or backup:

```powershell
$restoreDb = Join-Path $backupDir ("restore-check-{0}.db" -f (Get-Date -Format "yyyyMMdd-HHmmss-fff"))
$restoreCode = @'
import os, sqlite3, sys
source, destination = sys.argv[1:]
if os.path.exists(destination): raise SystemExit("Refusing to overwrite an existing restore target")
with sqlite3.connect(source) as src, sqlite3.connect(destination) as dst: src.backup(dst)
with sqlite3.connect(destination) as check:
    if check.execute("PRAGMA integrity_check").fetchone() != ("ok",): raise SystemExit("Restore integrity check failed")
if os.name != "nt": os.chmod(destination, 0o600)
'@
uv run python -c $restoreCode $backupDb $restoreDb
```

For an application restore, stop the Forge instance you own, point `FORGE_DATABASE_URL` to the restored copy, run `uv run alembic upgrade head` against that copy, and start Forge with the same URL. Confirm expected Workspace/Project records before directing normal work to it. Retain the original database and backup until the restore is verified. This is an operator procedure; Forge does not yet provide in-app backup management or automated retention.

## Diagnostics and known limits

- If a configured port is occupied, use the shared `FORGE_BACKEND_PORT` / `FORGE_FRONTEND_PORT` settings or the documented launcher. Forge and E2E refuse unsafe server reuse; do not terminate an unrelated process.
- If startup fails, check the selected database URL, migration output, and `/api/health`. Keep migration and server environment variables aligned.
- Repository connections are optional and read-only. Their roots must be in the currently approved repository-root configuration.
- Runs and Handoffs are human-entered work records; Forge does not launch agents or import their conversations.
- Context packages and release records are local snapshots. Verification covers only named, implemented deterministic checks; it does not run tests, remote CI, or inspect arbitrary artifact bytes. A readiness or gate result is not proof that code is implemented, deployed, or released.
- No cloud synchronization, multi-user collaboration, authentication, Git writes, deployment, or release publishing is included. No external LLM/provider credentials are required.
- External user acceptance has not been performed by this automated checklist. Product feedback and legal/licensing review remain owner responsibilities.

## Certification checklist

The release branch must record real results for locked installation, Alembic upgrade, Ruff, mypy, pytest, secret audit, frontend lint, TypeScript, Vitest and coverage, architecture/API contract checks, Vite build, Chromium journeys, E2E isolation, Light/Dark contrast, visual references, and GitHub Actions. Do not mark a gate as passing unless its command or CI check completed successfully. Preserve the exact test command output and screenshot/trace artifacts used for review; diagnostic artifacts belong under ignored test output directories.
