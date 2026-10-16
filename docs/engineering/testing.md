# Engineering checks

Use the documented toolchains (`uv sync --locked --dev` and, from `frontend/`, `npm ci`). The complete local sequence is also available as `scripts/test.ps1`. E2E starts isolated backend/frontend servers, uses a temporary SQLite database, refuses occupied ports and does not reuse or terminate unrelated processes.

## Backend

```powershell
uv run ruff check backend
uv run mypy backend
uv run pytest
uv run alembic upgrade head
```

`pytest` includes application-boundary, API/OpenAPI/route registry, service and migration behavior tests. Run fresh and incremental Alembic checks against temporary SQLite files; do not use a personal database for certification.

The opt-in production-serving path has an executable end-to-end smoke: `uv run python scripts/smoke_local_runtime.py`. It builds the real Vite output, applies Alembic to a temporary SQLite file, proves an occupied sentinel port is neither reused nor contacted, then starts only its own loopback FastAPI process on a free controlled port. It verifies root/assets/deep links/API/origin/path behavior and persisted Workspace/Project records, stops only that child and removes its temporary data. CI runs this smoke before the existing Vite-development Chromium suite.

## Frontend

From `frontend/`:

```powershell
npm run lint
npm run typecheck
npm run test
npm run test:coverage
npm run build
npx playwright install chromium
npm run e2e
npm run test:isolation
```

Vitest includes the architecture-boundary checker, API operation contracts and response-contract verification. Chromium E2E uses real FastAPI routes and temporary SQLite. The isolation probe proves tests do not write to a pre-existing server. Keep `e2e/` browser tests outside Vitest.

## Visual baselines and accessibility smoke checks

`frontend/e2e/visual-baseline.spec.ts` seeds deterministic local records and compares 29 desktop-dark, desktop-light and mobile screenshots against the approved Windows/Chromium snapshots in `frontend/e2e/visual-baseline.spec.ts-snapshots/`. Current-run candidate captures are written separately under ignored `frontend/artifacts/rfx-org-03b/candidate/`. The visual phase runs against its own temporary server/database before behavioral E2E, so earlier journeys cannot change global workspace counts. The browser checks include Command Palette focus/escape restoration, theme persistence, accessible page landmarks and mobile layout measurements. The six-column Kanban deliberately retains its existing 1030px minimum width and horizontal scroll at a 390px viewport; this baseline is preserved, not treated as a new regression.

Run the focused comparison with `npm run e2e -- e2e/visual-baseline.spec.ts`. Pixel comparison is performed when run on Windows, matching the captured platform and fonts; other platforms still save candidate captures and run behavioral/layout checks. Baseline snapshots are not auto-updated. Do not pass `--update-snapshots` for routine checks; changing approved images requires an explicit visual review. Only mask proven nondeterministic fixture data (opaque IDs, fingerprints, dates, temporary repository path), never layout or visual regions to hide a mismatch.

## Secret audit and local data

Run `uv run python scripts/audit_secrets.py` before delivery. It scans reachable Git history, index and tracked/non-ignored working-tree files, redacts findings and fails on scanner errors. Ignored generated output is outside its declared coverage. Tests and visual fixtures must use temporary databases and repositories, never the developer's personal `.forge/data/forge.db`.
