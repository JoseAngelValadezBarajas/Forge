# RFX-ORG-03C · Comprehensive Quality Certification

Date: 2026-10-16 · Baseline: `5605a618c7cb3adb0cfd350b91c23506c080db5e` (merged PR #18) · Branch: `quality/rfx-org03c-certification`

## Environment and scope

Local certification ran on Windows (`10.0.26300.0`), Python 3.12.10 / pytest 9.0.3, Node 24.13.0 / npm 11.6.2, and the repository-locked Playwright 1.64.0 Chromium. Backend tests and browser E2E used temporary SQLite databases; no developer database or unrelated process was modified. No runtime or test dependency was added, and no schema or API contract changed.

## Critical behavior matrix

| Area / invariant | Existing and added evidence | Result and remaining gap |
| --- | --- | --- |
| Delivery provenance; REPORTED is not VERIFIED; V01 artifact integrity is unavailable | `backend/tests/test_fnd06_delivery.py`; `frontend/src/features/delivery/delivery.test.tsx`; `frontend/e2e/fnd06.spec.ts` | Pass. UI and fixtures state that Forge does not inspect artifact bytes. |
| Preview does not persist; saved evaluations remain historical; BLOCKED / STALE / READY_BY_DEFINED_GATES stay distinct | FND-06 backend tests; new preview-vs-save React regression; FND-06 Chromium journey | Pass. Preview-only action made no evaluate/save request; saved snapshot remained listed. |
| Invalid evidence references and failed mutation recovery | FND-06 API tests; new evidence-form and candidate-form regressions | Pass. Unsafe reference receives an announced error; text and selections survive correction/retry. Candidate HTTP 409 is announced once, not duplicated. |
| Frozen Release Candidate immutability, gate and manifest persistence/eligibility, downloads | FND-06 backend tests; new frozen-detail React regression; FND-06 Chromium journey | Pass for exercised paths. No automated UI assertion covers every gate-rule permutation; backend rule/manifest tests cover those contracts. |
| Decision revisions, supersession, exact-revision acknowledgement, stale readiness and archived-project restrictions | `backend/tests/test_fnd03.py`; new Decisions React regressions; `frontend/e2e/fnd03.spec.ts` | Pass for the covered lifecycle. New tests cover failed-create recovery, stale saved history, and recoverable expected-revision conflict. |
| Invariant acknowledgement/revision behavior and recovery | FND-03 backend tests; new Invariants React regression | Pass for whitespace validation and failed-save recovery. |
| Run lifecycle, optimistic concurrency, output references, append-only events, Handoff revisions/withdrawal/acknowledgement | `backend/tests/test_fnd05_runs_handoffs.py`; new Workbench React regressions; `frontend/e2e/fnd05.spec.ts` | Pass for API and tested journeys. Handoff Queue has no dedicated unit-level React coverage; its route is included in visual capture. |
| Planning dependencies/cycles, ordering, archive constraints and cross-project isolation | `backend/tests/test_planning.py`, `backend/tests/test_workspace_projects.py`; planning React tests; `frontend/e2e/planning.spec.ts`, `frontend/e2e/val01.spec.ts` | Pass for existing API/UI journeys; no new production behavior was introduced. |
| Repository read-only observation, path trust, symlink boundary, deterministic Context Package | `backend/tests/test_fnd04_git_context.py`; FND-04 Chromium journey; visual fixture | Pass on supported cases. Windows skips the two symlink-dependent backend cases; Linux CI is the authoritative symlink run. |
| Cancellation/stale responses, workspace changes and navigation | Existing App, repository and feature tests; VAL-01 Chromium journeys | Pass in covered flows. |
| Command Palette accessibility, focus loop/restoration, mobile overflow, form error announcements | New App React regression and `frontend/e2e/accessibility.spec.ts`; Delivery error regression | Pass. Mobile Board intentionally scrolls inside its board; the document itself has no horizontal overflow. |

## Test and coverage results

| Measure | Baseline | Certified branch |
| --- | ---: | ---: |
| Vitest | 170 | 181 passed (18 files) |
| Backend pytest | 88 passed, 2 skipped | 88 passed, 2 skipped on Windows |
| Chromium functional E2E | 12 | 13 passed; 13/13 passed in each of three consecutive isolated runs before final screenshot-output-only adjustments, then 13/13 in the final integrated run |
| Approved Windows visual references | 29 | 29/29 passed; reference PNGs and thresholds unchanged |
| API contracts | 94/94 | 94/94 request and response contracts |

Frontend V8 coverage, with denominator unchanged and no exclusions added:

| Scope | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| Whole frontend | 70.5% (1,537/2,180) | 63.6% (1,054/1,657) | 65.0% (530/816) | 71.4% (1,401/1,962) |
| Decisions | 73.0% | 58.8% | 76.0% | 76.7% |
| Delivery | 70.1% | 68.7% | 52.7% | 69.4% |
| Invariants | 79.1% | 63.5% | 73.0% | 81.0% |
| Planning | 59.7% | 54.6% | 58.5% | 61.7% |
| Projects | 75.9% | 69.9% | 63.8% | 79.8% |
| Readiness | 74.7% | 60.5% | 67.9% | 77.4% |
| Repositories | 66.2% | 53.3% | 71.9% | 68.4% |
| Workbench | 69.6% | 63.2% | 69.1% | 70.5% |
| Workspaces | 100.0% | n/a | 100.0% | 100.0% |

Global line coverage rose from 58.81% (1,154/1,962) to 71.4% (1,401/1,962), a gain of 247 lines / 12.59 percentage points. The 75% goal was not reached. The remaining denominator is concentrated in larger screens and secondary branches (including EvidenceForm, CandidateDetail and HandoffQueue); those require additional behavior-specific cases rather than broad or trivial assertions. This is recorded as a follow-up, not disguised by exclusions.

## E2E reliability and artifacts

- Playwright retries are zero; no arbitrary sleeps were added. The three consecutive functional runs each passed 13/13.
- The visual fixture's repository observation timestamp is normalized only inside an already-masked element. Its natural width now matches the approved reference geometry; no mask or threshold changed.
- Each `npm run e2e` invocation owns a unique temporary-resource directory. Cleanup validates the exact invocation directory and refuses files or symlinks. Two Node regressions prove unrelated matching files are preserved.
- The Playwright backend launcher requires the wrapper-provided ownership path and fails closed when invoked directly; supported browser-test entrypoint is `npm run e2e`.
- `npm run test:isolation` passed: a deliberately pre-existing server on the probe port received no E2E writes. Playwright uses `reuseExistingServer: false` and strict ports.
- FND-06 browser screenshots now go to Playwright's per-test `test-results` directory instead of overwriting the 14 tracked `frontend/artifacts/fnd06` images. A post-change FND-06 run passed and left those source artifacts unchanged.
- The integrated E2E run passed the visual-baseline test and all 13 behavioral tests. Visual capture includes desktop, light/dark and representative mobile screens; the mobile Board's horizontal scroll is internal by design.

## Accessibility and visual follow-ups

The added Chromium check verifies Command Palette dialog naming, keyboard focus containment/restoration, and mobile document overflow. React coverage verifies that a failed Candidate mutation has one alert announcement and preserves its draft.

Manual token contrast inspection found a known Light Mode deficiency: `--text-subtle` (`#87909a`) has 2.82:1 contrast on `--bg` (`#f1efeb`) and 3.08:1 on `--surface` (`#faf9f6`), below the 4.5:1 WCAG AA criterion for normal-size text. It is used for visible metadata. No CSS was changed because this would alter approved visual references and the brief requires preserving them; a design-owner-approved token correction and deliberate baseline review remain a P2 follow-up. This is not represented as an accessibility pass for all text.

A dedicated Windows-hosted visual CI job was not added. The current runner's OS/font rasterization must match the snapshot-producing environment; hosted Windows labels do not pin that exact environment. Existing Linux CI continues to run behavior and responsive checks, while the 29 pixel comparisons were executed on the compatible local Windows host. No pixel thresholds were widened.

## Security, dependencies, and residuals

- Secret audit: PASS across 56 reachable commits, 371 index files and 374 working-tree files; 550 binary and 0 symlink files skipped. No finding was emitted. Binary contents and symlink targets are explicit coverage limits of the scanner.
- The repository Dependabot API returned zero alerts across all states during this run. No pytest advisory ID, affected range or fixed version was available, so no dependency was changed. The tested lock/install is pytest 9.0.3; if the owner refers to a different alert, its ID is needed to verify remediation.
- Backend emits existing deprecation warnings for Starlette's `httpx` TestClient integration and Alembic's missing `path_separator`; they do not fail tests and were not changed in this scope.
- GitHub Actions and CodeQL are checked on the Draft PR; consult the live PR checks for their current status.

## Local gates

Passed: Ruff, strict mypy, backend architecture checker, pytest, fresh and incremental temporary-SQLite migration tests, secret audit, ESLint, TypeScript, Vitest/V8 coverage, frontend architecture checker, frozen request/response contracts, Vite production build, Chromium E2E (visual and functional), and negative E2E isolation.

External user validation and bug-free status are not claimed.
