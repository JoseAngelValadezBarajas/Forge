# Forge

Forge is a local-first workspace for connecting product intent, optional local Git observations, deterministic planning context and delivery evidence. FND-04 adds read-only repository connections and immutable Context Packages to the FND-01/FND-02/FND-03 planning foundation. Projects remain useful before any repository or integration is connected.

The current product slice is an internal alpha. See the [Planning MVP alpha readiness guide](docs/releases/alpha-01-readiness.md) for the validated local workflow, isolated smoke tests, data backup/restore procedure, and current limitations.

## Status

FND-06 adds declared evidence, deterministic verification of saved Forge snapshots, and immutable release-candidate snapshots with explainable gates and manifests. Forge does not fetch external URLs, import or execute artifacts, run tests or remote CI, write Git, deploy, or publish releases. A user report remains REPORTED; a passing named check proves only its stated condition. `READY_BY_DEFINED_GATES` is not functional verification, and every manifest remains `NOT_PUBLISHED`. See the [FND-06 model and limitations](docs/product/fnd06-evidence-and-releases.md) and [API contracts](docs/product/fnd06-api-contracts.md).

## Licensing

Forge is source-available. Forge code and materials for which the project rights holder owns the relevant rights are offered under the [PolyForm Noncommercial License 1.0.0](LICENSE.md). Forge is not presented as Open Source Initiative-approved software.

The Community terms do not automatically authorize commercial exploitation outside PolyForm's permitted purposes. A commercial business must obtain a separate written [Forge Commercial](COMMERCIAL-LICENSING.md) agreement before internal use for a commercial purpose or other commercial exploitation, unless the specific use is independently permitted by PolyForm. PolyForm's stated exceptions and rights recognized by law remain applicable.

Copyright and attribution details are in [NOTICE](NOTICE). Project identity guidance is in [TRADEMARKS.md](TRADEMARKS.md), contribution rules are in [CONTRIBUTING.md](CONTRIBUTING.md), and responsible disclosure guidance is in [SECURITY.md](SECURITY.md).

## Planning slice

After selecting a project, the Overview links to the persistent Board, Features/Epics, Decisions and Invariants views. A Feature detail view shows the six deterministic readiness rules, preview versus saved evaluation history, current-staleness state, linked decisions and revision-aware invariant acknowledgements. Board states and acknowledgements are manual planning declarations, not delivery evidence.

Projects can optionally connect one or more local Git working trees. Repositories are observed on demand with bounded, read-only metadata collection. A Feature can link repositories and generate a `forge-context-v1` Context Package containing normalized planning data and selected Git observations. Packages are immutable, fingerprinted and deduplicated; preview never creates history.

The FND-05 Workbench records human-reported Agent Runs against an immutable Context Package, append-only timeline events, structured output references and explicit Handoffs. Published Handoff revisions are deterministic `forge-handoff-v1` documents that can be reviewed, acknowledged by revision and exported as JSON or Markdown. Forge does not start agents or read conversations; see [`docs/fnd05-runs-handoffs.md`](docs/fnd05-runs-handoffs.md).

## Stack

- Backend: Python 3.12+, FastAPI, Pydantic Settings, SQLAlchemy 2, SQLite, Alembic, uv, pytest, ruff and mypy.
- Frontend: React, TypeScript strict, Vite, React Router, CSS variables, Vitest, React Testing Library, Playwright and ESLint.

Current module ownership, dependency rules and stylesheet composition are documented in the [architecture guide](docs/architecture/README.md). Reproducible quality checks and visual baselines are described in [engineering/testing](docs/engineering/testing.md).

## Run locally on Windows

Prerequisites: Python 3.12+, Node.js `24.13.0`, npm `11.6.2`, uv and Git. The Node version is recorded in `.node-version` and `.nvmrc`; the frontend package enforces the compatible Node/npm range.

```powershell
uv sync --locked --dev
uv run alembic upgrade head
uv run --directory backend python -m app.initialization
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

### Optional single-origin local runtime

To serve the production frontend build and FastAPI from one loopback origin, build the frontend and start the local runtime:

```powershell
Push-Location frontend
npm run build
Pop-Location
$env:FORGE_RUNTIME_MODE = "local"
uv run --directory backend python -m app.local_runtime
```

Open `http://127.0.0.1:8000`. Node is needed to build the assets, not to serve them. The runtime binds only to a literal loopback IP, validates the compiled build before startup, accepts only the configured loopback `Host` and port, and requires the configured same-origin `Origin` for browser mutations. Host validation helps prevent DNS rebinding; it is not authentication against arbitrary local processes, which can call loopback APIs directly. Do not expose this mode to a network. This mode does not relocate the database or run migrations automatically; migrate the selected database explicitly first. See [runtime/platform boundaries](docs/architecture/README.md#runtime-modes-and-platform-boundaries) for future DESK-01 and WEB-01 responsibilities.

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

The implementation uses the supplied Forge Figma file as the visual reference. The accessible Core canvas is `04 — Desktop / Core` (`node-id=1:5`), with Workspace Home at `4:32` and Project Overview at `4:158`. The shell follows the inspected graphite/copper palette, 232px sidebar, compact workspace header, rounded graphite surfaces, Geist-style type hierarchy and IBM Plex Mono labels. Figma sample content is replaced with records from SQLite or honest empty states; no sample projects, commits, CI results or verification claims are rendered.

The FND-02/FND-03 visual review uses Project Overview (`4:158`), Project Board (`4:271`), Feature Detail (`5:89`) and the compact Readiness component (`12:30`) from the supplied Forge Figma file, with Foundations, Components, Interaction & States and Responsive & Layout as supporting references.

## Repository layout

```text
backend/app/{domain,application,persistence,git,context,handoffs,api}
backend/migrations
backend/tests
frontend/src
frontend/src/styles              shared CSS composition and tokens
frontend/src/{app,features}       shell and capability-owned styles
frontend/e2e
docs/architecture                current architecture + archived refactor history
docs/engineering
scripts
```

