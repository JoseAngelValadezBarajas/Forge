# CI-01 Efficient Pipelines & Main Desktop Artifacts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Preserve complete PR validation while producing a traceable, exact-SHA Windows installer only after a successful `main` quality and CodeQL certification.

**Architecture:** Keep PR quality and desktop entrypoints stable, classify PR changes at job level, and share the Windows build through a reusable workflow. A trusted `workflow_run` guard checks the completed `main` Quality event and the matching CodeQL run before invoking the shared Windows workflow with the immutable SHA.

**Tech Stack:** GitHub Actions YAML, PowerShell, Python 3.12 standard library/pytest, existing Rust/Tauri/NSIS/Node/uv toolchains.

**Spec:** `docs/superpowers/specs/2026-10-19-ci-01-pipeline-architecture-design.md`

## Global Constraints

- `origin/main` baseline is `9f3113c0c6532f751094fa075bb879a4eef9c81d`.
- PRs retain Ruff, mypy, pytest, migrations, frontend lint/typecheck/Vitest/coverage/build, architecture/API checks, Chromium, isolation, secret audit, CodeQL and desktop validation when sensitive.
- Only documentation-only PRs may skip the expensive Windows job; workflow-level path filters are forbidden so required checks cannot become permanently pending.
- Main certification must checkout and publish against the exact completed `main` commit SHA.
- NSIS remains pinned to 3.13.0 with bounded retries and integrity-verified official fallback.
- Failed builds and installed-product smoke never publish the certified main artifact.
- No release, tag, merge, product feature, database change or new runtime dependency.

## Review Focus

- A docs-only PR must leave the Windows check present and successfully skippable; test `desktop_required_for_event("pull_request", docs_paths) is False` and workflow job-level gating.
- A frontend, backend, Tauri route, packaging or workflow change must not skip Desktop; test each path class independently.
- A workflow-run main build must reject a PR event, non-main branch, failed Quality conclusion and moving-head substitution; test guard text and exact SHA inputs.
- A CodeQL run for a different SHA must not unlock publishing; test the bounded CodeQL lookup contract.
- A failed Windows step must not create an official artifact; test the success-only upload policy and separate diagnostic path.

### Task 1: Add deterministic change classification and policy tests

**Files:**
- Create: `scripts/ci_change_policy.py`
- Test: `backend/tests/test_ci_change_policy.py`

**Interfaces:**
- Produces `classify_paths(paths: Iterable[str]) -> str` returning `docs-only` or `desktop-sensitive`.
- Produces `desktop_required_for_event(event_name: str, paths: Iterable[str]) -> tuple[bool, str]`.
- CLI emits `desktop_required=true|false` and a sanitized `reason=` suitable for `$GITHUB_OUTPUT`.

- [ ] **Step 1: Write failing tests** for legal/docs-only paths, frontend paths, backend/migration paths, Tauri/packaging paths, workflow paths and unknown source paths.
- [ ] **Step 2: Run `uv run pytest backend/tests/test_ci_change_policy.py -q` and confirm the new import/behavior fails.**
- [ ] **Step 3: Implement the conservative classifier** with normalized POSIX paths, an explicit documentation allowlist, and non-PR events always requiring Desktop.
- [ ] **Step 4: Run the focused tests and then `uv run pytest backend/tests/test_ci_change_policy.py -q`; expect all pass.**

### Task 2: Extract the shared certified Windows workflow

**Files:**
- Create: `.github/workflows/desktop-certified.yml`
- Modify: `.github/workflows/desktop-windows.yml`
- Test: `backend/tests/test_ci_workflow_policy.py`

**Interfaces:**
- Reusable workflow inputs: required `commit_sha`, required `artifact_name`, numeric `artifact_retention_days`, and boolean `publish_certified_artifact`.
- The reusable job checks out `inputs.commit_sha`, retains current NSIS/Rust/frontend/sidecar/smoke commands, verifies installer checksum and writes `desktop-provenance.json`.

- [ ] **Step 1: Add failing policy tests** asserting exact-SHA checkout, `--locked` Rust commands, pinned NSIS bootstrap retention, success-only official upload, PR artifact naming and provenance fields.
- [ ] **Step 2: Run `uv run pytest backend/tests/test_ci_workflow_policy.py -q` and confirm the reusable workflow is absent.**
- [ ] **Step 3: Move the existing Windows job steps into the reusable workflow** without changing product commands; add exact SHA checkout, checksum verification, provenance generation, 14/7-day retention and separate failure diagnostics.
- [ ] **Step 4: Convert the PR workflow to a caller** with the unchanged job name, existing PR/manual triggers, classifier dependency and `if: needs.change-classification.outputs.desktop_required == 'true'`. Keep no workflow-level `paths` filter and cancel only PR concurrency groups.
- [ ] **Step 5: Run policy tests and `node --test scripts/desktop-build-utils.test.mjs`; expect pass.**

### Task 3: Add guarded main orchestration

**Files:**
- Create: `.github/workflows/main-desktop.yml`
- Modify: `backend/tests/test_ci_workflow_policy.py`

**Interfaces:**
- `workflow_run` accepts only completed `Forge quality` runs for `main` in the same repository.
- Guard outputs `commit_sha` and `codeql_run_id` only after Quality success and a successful CodeQL run for the same SHA.
- Manual dispatch requires an explicit SHA equal to the current `main` ref.

- [ ] **Step 1: Extend failing policy tests** for event/branch/repository/conclusion guards, CodeQL same-SHA lookup, exact reusable input, main artifact name, no PR trigger and no cancellation.
- [ ] **Step 2: Run the focused policy tests and confirm the main workflow contract is absent.**
- [ ] **Step 3: Implement the bounded guard** using the built-in `gh api` CLI and `checks: read`/`actions: read` permissions; poll only the CodeQL workflow ID resolved from the repository workflow list and fail with a clear diagnostic on timeout.
- [ ] **Step 4: Invoke the reusable workflow** with `commit_sha` from the guard and `forge-windows-x64-main-${{ needs.guard.outputs.commit_sha }}`; publish only on success.
- [ ] **Step 5: Run policy tests and inspect the rendered workflow text for forbidden `pull_request`, `continue-on-error`, automatic lock generation and moving-head checkout.**

### Task 4: Update CI documentation and performance evidence

**Files:**
- Create: `docs/engineering/ci-01-pipeline-architecture.md`
- Modify: `docs/superpowers/specs/2026-10-19-ci-01-pipeline-architecture-design.md` if measurements change

- [ ] **Step 1: Document the actual execution graph**, PR classification, main `workflow_run` guard, SHA/artifact lifecycle, retention, cache decisions, failure recovery and manual dispatch procedure.
- [ ] **Step 2: Record baseline timing evidence** from runs `39269774686`, `39269775183`, `39240954703` and `39240954657`, explicitly marking main installer timing as not available until post-merge.
- [ ] **Step 3: State the distinction between PR validation artifact, certified main installer and GitHub Release.**
- [ ] **Step 4: Run documentation/policy tests and review the diff for unrelated product or license changes.**

### Task 5: Full certification and delivery evidence

**Files:**
- Modify only files from Tasks 1–4.

- [ ] **Step 1: Run backend lint, mypy, pytest, migrations and secret audit.**
- [ ] **Step 2: Run frontend lint, typecheck, coverage/unit tests, build and architecture/API checks.**
- [ ] **Step 3: Run Chromium E2E and isolation with temporary data.**
- [ ] **Step 4: Run deterministic CI-policy tests and `git diff --check`.**
- [ ] **Step 5: Push only `ci/ci-01-pipeline-efficiency`, create the single Draft PR, and verify applicable PR checks.**
- [ ] **Step 6: Report Stage A `READY_FOR_REVIEW`; explicitly do not claim `POST_MERGE_CERTIFIED` or a certified main artifact from this unmerged branch.**

## Self-review

- All requirements map to Tasks 1–5; main-only certification is intentionally deferred until merge because a PR cannot truthfully demonstrate a main-only `workflow_run` artifact.
- The shared workflow keeps production build commands and NSIS bootstrap intact; only orchestration, provenance and publication conditions change.
- Policy tests cover all five review-focus failure modes.
- Cargo caching is intentionally not introduced without measured benefit; existing npm/uv caches remain.
