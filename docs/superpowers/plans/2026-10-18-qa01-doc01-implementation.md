# QA-01 + DOC-01 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver targeted isolated acceptance coverage and a reproducible illustrated Spanish Forge user guide.

**Architecture:** Browser journeys remain in the existing Playwright runner and share real FastAPI/temporary SQLite setup. Documentation uses deterministic E2E capture plus a small Node export pipeline using the existing Playwright dependency; Markdown stays the canonical source.

**Tech Stack:** Playwright, Node.js, TypeScript, Markdown, HTML/CSS, FastAPI/SQLite test runtime.

**Spec:** `docs/superpowers/specs/2026-10-18-qa01-doc01-design.md`

## Global Constraints

- Branch from `origin/main` baseline `14495ab8099c6c7626be70c3a9ff78cfd43e796d`.
- Preserve existing visual baselines, Windows UI Automation, API contracts, and isolated E2E semantics.
- Do not use personal data, pre-existing servers, CDP/WebView debugging, release publishing, or product scope outside QA-01/DOC-01.
- Add no dependency unless an existing tool cannot produce a correct, verified document export.

## Review Focus

- Documentation capture must not write fixture data outside the isolated temporary backend/database.
- An unauthorized Git path must be rejected without changing a repository record or fixture repository.
- A blocked release gate must not be described as a successful verification or publication.
- HTML/PDF must retain manual links and readable image layout, not merely complete with exit code zero.
- The manual must not imply that Forge executes agents, CI, deployments, or external Git actions.

### Task 1: Coverage matrix and targeted E2E journeys

**Files:**
- Create: `docs/engineering/qa-01-e2e-coverage.md`
- Create: `frontend/e2e/qa01-acceptance.spec.ts`
- Modify: `frontend/e2e/run.mjs` only if ordered capture isolation requires it.

- [ ] Write focused E2E tests for absent cross-feature/negative behaviors and run them red.
- [ ] Add the smallest production fix only if those tests expose a real defect; otherwise preserve product behavior.
- [ ] Add the coverage matrix mapping existing and QA-01 suites to journeys, explicit negative cases, and intentionally deferred gaps.
- [ ] Run the new spec and existing affected specs green.
- [ ] Commit the focused acceptance coverage.

### Task 2: Deterministic documentation fixture and assets

**Files:**
- Create: `frontend/e2e/user-guide-assets.spec.ts`
- Create: `docs/user-guide/assets/*.png`
- Modify: `frontend/package.json`
- Modify: `frontend/e2e/run.mjs`

- [ ] Write a failing Node/Playwright test for the expected capture manifest and safe asset paths.
- [ ] Implement a fixture command that creates real, sanitized screenshots against the isolated runner without touching visual baselines.
- [ ] Generate required desktop screens with deterministic records and verify all manifest assets exist/read as PNG.
- [ ] Run fixture tests and the focused capture command green.
- [ ] Commit fixture code and audited screenshots.

### Task 3: Canonical manual and reproducible HTML/PDF export

**Files:**
- Create: `docs/user-guide/README.es.md`
- Create: `scripts/build_user_guide.mjs`
- Create: `scripts/validate_user_guide.mjs`
- Create: `docs/user-guide/user-guide.css`
- Create: `docs/user-guide/Forge-User-Guide.es.html`
- Modify: `frontend/package.json`, `README.md`, `.github/workflows/quality.yml`
- Test: `scripts/user-guide-build.test.mjs`

- [ ] Write failing builder/validator tests for required sections, links, screenshot manifest, HTML TOC, PDF metadata, and unsafe/missing paths.
- [ ] Implement Markdown validation and bounded rendering for the manual syntax used by this guide; use existing Playwright to print PDF.
- [ ] Author the manual exclusively from visible product labels and documented limitations, then generate HTML/PDF.
- [ ] Render PDF pages and inspect them programmatically and visually for overflow, readable screenshots, links, margins and page numbering.
- [ ] Add CI documentation build/artifact steps and README links.
- [ ] Run documentation tests/build green and commit the guide/export pipeline.

### Task 4: Certification, review, and delivery

**Files:**
- Modify: documentation only if verification identifies an in-scope issue.

- [ ] Run backend lint/types/boundaries/tests/migrations/secrets.
- [ ] Run frontend lint/types/unit/coverage/contracts/build, visual baselines, full E2E and isolation.
- [ ] Run documentation validation/build/PDF rendering inspection and the installed-product workflow where available.
- [ ] Review the branch diff, run GitHub Actions/CodeQL after push, and correct one evidenced in-scope defect pass if necessary.
- [ ] Commit the certified changes, push the branch, and open one Draft PR without merging.
