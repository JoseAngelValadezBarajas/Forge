# Forge FND-00: independent code review

**Baseline:** `6bb8050e5350e9c4b2ed1b8e28d046e317c6d905` (`chore: bootstrap Forge walking skeleton`)
**Source:** `Forge-FND00-review.zip`, an archive of that commit.
**Scope:** architecture, startup/SQLite, frontend interaction, basic security, dependencies, quality and publication readiness.
**Decision:** **CHANGES REQUESTED before public release**. FND-00 is a sound walking skeleton, but its operational/test boundaries need targeted hardening.

## Verified

- The archive has 65 ZIP members (including directory entries), with a FastAPI backend, React/TypeScript/Vite frontend, SQLite/Alembic scaffolding, Git-ignore, documentation, and test files.
- No `.env`, SQLite database, credential file, private key, node_modules, `.venv`, generated dist, or Git directory appears in the archive inventory.
- A focused, non-exhaustive secret-pattern search of the archived source found no secret literals. **This is not a full-history secret scan**; `git archive` does not include Git history.
- **Independent runtime check:** `PYTHONPATH=backend python -m pytest backend/tests/test_health.py -vv -s` passed (1 test), with JSON lifecycle logs and `/api/health` returning HTTP 200. The reviewer environment used Python 3.13.5 and installed dependencies; it did not verify locked/fresh-clone installation.
- FND-00 appropriately renders honest empty states instead of fictional real repositories, agent runs, CI attestations, or delivery evidence.

## Actionable findings

### P1-01: Incorrect backend/proxy alignment undermines E2E integration check

- `frontend/playwright.config.ts:16-18` starts and probes port **8001**.
- `frontend/vite.config.ts:9-11` proxies `/api` to **8000**.
- `frontend/e2e/smoke.spec.ts:21-25` directly requests `8001`, bypassing Vite's proxy.

Result: E2E can pass while `/api` through the frontend is broken or routed to an unrelated local service on 8000. This matters particularly on a machine that also runs other local applications.

**Fix:** one explicit backend port setting/source for Vite proxy, Playwright webServer, scripts and docs. In E2E, call `${baseURL}/api/health` (through Vite), and assert the expected Forge identity. Add a regression test when the expected backend is absent/mismatched. Keep binding to `127.0.0.1`.

### P1-02: SQLite path depends on current working directory

- `backend/app/config.py:11` defaults to `sqlite:///./forge.db`.
- `backend/app/db.py:13-16` constructs the engine from that URL.
- `backend/migrations/env.py:14` feeds it to Alembic.
- `alembic.ini:2-4` lives at the repo root.
- `scripts/start.ps1:21` changes cwd to `backend` before launching Uvicorn.

When migration runs from the root, the relative URL points to `<repo>/forge.db`. The launcher resolves it to `<repo>/backend/forge.db`. These are distinct SQLite files. The root database is not covered by the existing exact `.gitignore` path.

**Fix:** resolve local database location deterministically against a single Forge data directory or an explicitly configured absolute path, independent of `cwd`; use exactly the same resolved URL for migrations and app startup. Test both root/backend cwd. Ignore SQLite sidecars and the chosen data directory.

### P1-03: Node prerequisites incompatible with the committed lockfile

- `README.md:16`: Node.js **20+**.
- `frontend/package.json:16-20,23-38`: dependencies declared as `latest`.
- `frontend/package-lock.json`: Vite 8.3.4 requires `^20.19.0 || >=22.12.0`; Vitest 5.0.4 requires `^22.12.0 || ^24.0.0 || >=26.0.0`; jsdom 30.1.2 requires `^22.22.2 || ^24.15.0 || >=26.0.0`.

**Fix:** select a compatible supported Node version (e.g. 24 LTS, verifying with the actual lockfile); add `.nvmrc` or `.node-version`, `engines` and matching docs/CI. Replace `latest` with explicit tested version ranges. Use `npm ci` rather than `npm install` in reproducibility checks.

### P2-01: Command Palette is not keyboard-first in practice

- `frontend/src/App.tsx:280-335` displays `↑↓ select · ↵ open` but doesn't implement arrow-key option selection or explicit Enter activation from the search input.
- `role="dialog"` and `aria-modal="true"` appear without focus trapping/restoration. Escape closes, but focus isn't restored to the invoker.
- Tests `frontend/src/App.test.tsx:31-37` only click a button with the mouse.

**Fix:** implement accessible listbox/combobox keyboard semantics or simpler roving focus with correct roles, `aria-activedescendant` if appropriate, arrow-key behavior, Enter and Escape; trap or contain modal focus and restore it to the button that opened the palette. Test keyboard only, including empty results.

### P2-02: Local secret/data ignore policy too narrow

- `.gitignore:7-9` excludes `backend/.env` and `backend/forge.db` but not root/frontend `.env`, `.env.local`, root `forge.db`, or arbitrary SQLite sidecars.

**Fix:** explicitly ignore all supported local environment-file locations, local runtime data (and `-wal`/`-shm` sidecars) without masking intentionally public `.env.example` files; add a prepublication Git index and history scan. Do not copy or commit secrets.

### P2-03: No GitHub Actions quality gate in the archive

No `.github/workflows` files are in the commit archive. The supplied local QA results may be correct, but no independent GitHub CI exists to validate a public push.

**Fix:** add GitHub Actions for Python and frontend, locked dependency installation, lint/typecheck/unit/build, basic Playwright Chromium smoke with a correctly aligned proxy, and no real external services/credentials. Keep workflow permissions minimal.

### P2-04: Startup does not reject a preoccupied backend port

- `scripts/start.ps1:17-26` starts backend on 8000 in a separate process and immediately starts Vite; it doesn't verify that the backend it reaches is **Forge**. With port 8000 occupied by another service, the UI may appear healthy while the API proxy targets the wrong app.

**Fix:** one backend port configuration, port availability check, startup health handshake confirming the Forge service, and a clear actionable error. Do not terminate the unrelated service.

## Non-blocking observations

- `backend/app/main.py:27-33` limits CORS methods to GET and the launcher binds to loopback, a good initial scope. Revisit origin and CSRF defenses **before adding mutations**. The frontend currently makes no API calls beyond what tests may probe.
- `backend/app/logging_config.py` emits JSON; `extra` fields such as `environment` and request `path` are not serialized. Add structured fields only when needed, with secret redaction.
- `.editorconfig` forces CRLF for every platform. Consider LF defaults, as the project will have Linux CI and mixed-platform contributors.
- `frontend/src/styles.css` has theme tokens, but actual accessibility needs browser/assistive technology checks rather than relying on the Figma review.
- Before a **public** repository/release, explicitly decide licensing. Without a license, publicly visible source isn't automatically open source.

## Recommended pass

1. Fix P1-01 through P1-03, P2-01, P2-02, P2-03, and P2-04 in one focused Codex pass. Add regression tests for each.
2. Run clean reproducible install/test/build/E2E on supported Node/Python, including a real HTTP request **through Vite's `/api` route**, and a real blocked-port scenario.
3. Perform a complete Git history and current-index secret/PII audit, ensure data excludes and generated artifacts are respected, and commit the fixes locally.
4. Create a **private** `JoseAngelValadezBarajas/Forge` repository using the local Git/`gh` CLI to preserve the original commit history, push the branch, inspect GitHub Actions, then choose public visibility and licensing deliberately.

**Do not treat the independent 1/1 Python test as certification of the frontend, CI, complete security, or fresh-clone reproducibility.** These still need the local/CI full suite.
