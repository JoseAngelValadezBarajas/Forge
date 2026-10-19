# IMP-01 Full Project JSON Import/Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a strict, deterministic, transactional Project planning JSON import/export flow with preview confirmation and real UI certification.

**Architecture:** A canonical `ProjectTransferService` owns validation, fingerprinting, read-only preview, deterministic export and one-transaction import. Pydantic contract models are transport-facing but domain-independent; the existing project/planning models remain the persistence boundary. React adds transfer operations to the Projects feature and reuses the existing API client, download transport and visual language.

**Tech Stack:** Python 3.12+, FastAPI, Pydantic, SQLAlchemy 2, SQLite, Alembic, pytest, React, TypeScript strict, Vitest, Playwright Chromium, existing Tauri route manifest and CI.

**Spec:** `docs/superpowers/specs/2026-10-18-imp-01-project-import-export-design.md`

## Global Constraints

- Work from `origin/main` on `feature/imp-01-project-import-export`.
- Contract version is exactly `forge-project-import-v1`.
- Preview is read-only; confirmation includes the expected canonical fingerprint.
- Import creates a new Project in one transaction and rolls back completely on any failure.
- Never import Decisions, Invariants, Runs, Evidence, Verifications, Release Candidates or repository state.
- Enforce the 8 MiB transport limit and collection limits before expensive work.
- Preserve existing API, desktop IPC, architecture and frontend behavior outside IMP-01.
- Do not merge, publish a release or start FND-07.

## Review Focus

- A preview fingerprint must reject a changed document before any database write: Task 2 tests `expected_fingerprint` mismatch and zero new rows.
- Same-name imports racing through SQLite must leave one Project and return one conflict: Task 2 tests concurrent duplicate creation.
- A malformed dependency graph must not create the Project or children: Task 1 tests missing refs, duplicate refs and cycles; Task 2 tests rollback.
- Exported order and local references must survive import into another Workspace without database IDs: Task 2 round-trip test and Task 4 E2E.
- Desktop transport must accept the new routes without broadening IPC authority: Task 3 updates and checks the generated manifest and 8 MiB policy.

---

### Task 1: Contract models, canonicalization and service validation

**Files:**
- Create: `backend/app/application/project_transfer.py`
- Create: `backend/app/api/schemas/project_transfer.py`
- Modify: `backend/app/api/schemas/__init__.py`
- Test: `backend/tests/test_project_transfer.py`

**Interfaces:**
- Produces `ProjectImportDocument`, `ProjectImportCommitRequest`, `ProjectImportPreviewResponse`, `ProjectImportResponse`, `canonical_import_json`, `import_fingerprint` and `ProjectTransferService`.
- `ProjectTransferService.preview(workspace_id, document)` performs no writes.
- `ProjectTransferService.import_project(workspace_id, document, expected_fingerprint)` returns generated-ID mappings or raises existing application errors.
- `ProjectTransferService.export_project(workspace_id, project_id)` returns the normalized document and canonical JSON.

- [ ] **Step 1: Write failing tests** for strict extras, unsupported schema/status, collection bounds, duplicate local refs, missing epic/dependency refs, self/cyclic dependencies and normalized defaults.
- [ ] **Step 2: Run `uv run pytest backend/tests/test_project_transfer.py -q` and verify the new tests fail for the missing contract/service.**
- [ ] **Step 3: Implement strict Pydantic models, normalized positions/defaults, canonical JSON and SHA-256 fingerprinting.**
- [ ] **Step 4: Implement read-only preview validation and deterministic export ordering without opening a write transaction.**
- [ ] **Step 5: Run the focused test file and verify all contract and preview tests pass.**
- [ ] **Step 6: Commit `feat: add versioned project transfer contract`.**

### Task 2: Atomic import, duplicate protection and API routes

**Files:**
- Modify: `backend/app/application/project_transfer.py`
- Modify: `backend/app/api/routers/planning.py`
- Modify: `backend/app/api/routes.py` and `backend/app/api/routers/__init__.py`
- Modify: `backend/app/api/errors.py` only if an existing error mapping needs a stable conflict.
- Test: `backend/tests/test_project_transfer.py`

**Interfaces:**
- Consumes Task 1 contract and service interfaces.
- Produces the three `/api/workspaces/{workspace_id}/projects/...` transfer endpoints and generated-ID response mapping.

- [ ] **Step 1: Add failing API/integration tests** for valid hierarchy import, preview row counts, fingerprint mismatch, cross-workspace rejection, archived export, duplicate name conflict and response ID mappings.
- [ ] **Step 2: Add failing rollback and concurrency tests** using temporary SQLite sessions; assert no Project, Epic, Feature, Task, Criterion or Dependency rows remain after mid-transaction failure and exactly one concurrent import wins.
- [ ] **Step 3: Run the focused tests and verify the failures demonstrate missing endpoints/atomic behavior.**
- [ ] **Step 4: Implement one-transaction model insertion with `flush`, case-insensitive name conflict translation, foreign-key checks, and fingerprint verification before writes.**
- [ ] **Step 5: Add FastAPI preview/commit/export handlers, response models and safe JSON attachment headers.**
- [ ] **Step 6: Run `uv run pytest backend/tests/test_project_transfer.py -q` and verify the full focused suite passes.**
- [ ] **Step 7: Commit `feat: add transactional project import and export API`.**

### Task 3: OpenAPI, schema artifacts and frontend API boundary

**Files:**
- Create: `docs/product/imp-01-project-import-export.md`
- Create: `docs/product/schemas/forge-project-import-v1.schema.json`
- Create: `docs/product/examples/forge-project-import-v1.valid.json`
- Create: `docs/product/examples/forge-project-import-v1.invalid.json`
- Modify: `frontend/src/features/projects/api/contracts.ts`
- Modify: `frontend/src/features/projects/api/index.ts`
- Modify: `frontend/src/api.ts`
- Modify: `desktop/src-tauri/resources/api-routes.json` via the existing generator.
- Test: `frontend/src/api.project-transfer.test.ts`, `backend/tests/test_api_contracts.py`, `backend/tests/test_desktop_route_manifest.py`

**Interfaces:**
- Consumes Task 2 endpoint paths and response shapes.
- Produces typed `previewProjectImport`, `importProject`, `exportProject` operations and checked-in contract/schema documentation.

- [ ] **Step 1: Add failing operation-level tests** for exact method/path/body, fingerprint envelope and download fallback filename.
- [ ] **Step 2: Add the JSON Schema, valid example, representative invalid example and concise product boundary documentation.**
- [ ] **Step 3: Implement typed frontend operations and regenerate the desktop route manifest from live OpenAPI.**
- [ ] **Step 4: Run Vitest API tests, OpenAPI contract tests and manifest checks; expected result is green with the new routes represented exactly once.**
- [ ] **Step 5: Commit `docs: publish project transfer contract and API surface`.**

### Task 4: Projects UI and real E2E workflow

**Files:**
- Modify: `frontend/src/features/projects/pages/ProjectsPage.tsx`
- Modify: `frontend/src/features/projects/pages/ProjectOverviewPage.tsx`
- Modify: `frontend/src/features/projects/styles.css` only for focused transfer panel states.
- Test: `frontend/src/features/projects/projects.test.tsx` or the existing project test location; create focused tests if absent.
- Create: `frontend/e2e/imp01.spec.ts`

**Interfaces:**
- Consumes Task 3 typed API operations.
- Produces accessible Import Project preview/confirm/error flow and archived Project export action.

- [ ] **Step 1: Add failing React tests** for file selection, paste, preview-required confirmation, readable validation errors, pending/success/error states and export action visibility for archived Projects.
- [ ] **Step 2: Implement the import panel with local file reading only, explicit preview fingerprint state, confirmation, navigation and controlled error handling.**
- [ ] **Step 3: Add Export Project to Project Overview using the shared download helper; keep it available for archived Projects and label it as planning-only.**
- [ ] **Step 4: Run focused Vitest tests and verify they pass without changing existing project workflows.**
- [ ] **Step 5: Add real Chromium E2E with temporary SQLite for upload, preview, invalid input, confirmation, hierarchy verification, export/reimport and duplicate rejection.**
- [ ] **Step 6: Run `npm run e2e -- e2e/imp01.spec.ts` and verify the real journey passes.**
- [ ] **Step 7: Commit `feat: add project import and export workflow`.**

### Task 5: Spanish manual, screenshots and final certification

**Files:**
- Modify: `docs/user-guide/README.es.md`
- Modify: `docs/user-guide/Forge-User-Guide.es.html` through the existing generator.
- Modify: `scripts/user-guide-assets.mjs` only if a new deterministic screenshot is required.
- Create/modify: `docs/user-guide/assets/imp01-*.png` from real Chromium fixtures only.
- Modify: `.github/workflows/quality.yml` for the IMP-01 E2E/docs artifact steps only if existing jobs do not cover them.

**Interfaces:**
- Consumes the completed UI and E2E journey.
- Produces Spanish import/export instructions, real evidence and a single CI-certified Draft PR.

- [ ] **Step 1: Add import/export instructions and explicit planning-only limitations to the Spanish manual.**
- [ ] **Step 2: Extend the existing real screenshot capture only for the new transfer panel if useful; validate PNGs and PDF output visually.**
- [ ] **Step 3: Run fresh and incremental Alembic tests, Ruff, mypy, pytest, secret audit, frontend lint/typecheck/Vitest/coverage/build, API and architecture checks, `npm run e2e`, isolation, docs/PDF validation and desktop manifest checks.**
- [ ] **Step 4: Run GitHub Actions, CodeQL and Windows installed-product smoke on the final commit.**
- [ ] **Step 5: Review the diff, verify a clean working tree, commit `feat: deliver IMP-01 project import and export`, push the branch and create one Draft PR targeting `main`.**

## Self-review

- Contract, strict validation, fingerprint confirmation, transactionality, duplicate/concurrency protection, route authority, UI workflow, docs and certification each have an owning task.
- Task interfaces use the same `ProjectTransferService` names and endpoint paths throughout.
- Review focus has explicit tests in Tasks 1–4.
- No task introduces FND-07, external integrations, LLM APIs, or unrelated refactoring.
