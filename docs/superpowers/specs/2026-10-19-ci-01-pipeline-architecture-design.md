# CI-01 Pipeline Architecture Design

## Goal

Keep pull requests fully validated while making every successful `main` commit produce one Windows installer artifact certified against that exact commit.

## Baseline evidence

- `origin/main`: `9f3113c0c6532f751094fa075bb879a4eef9c81d`.
- Quality on the merged baseline: `39269774686`, approximately 4m21s.
- CodeQL on the merged baseline: `39269775183`, approximately 5m29s.
- Recent PR quality: `39240954703`, 4m42s.
- Recent PR Windows build and installed smoke: `39240954657`, 14m01s.
- Exact-head Windows dispatch for the preceding desktop work: `39242765873`, 9m14s.
- The current Windows workflow has no `main` push trigger; therefore no certified `main` installer is currently produced.
- `main` is not branch-protected according to the GitHub API at inspection time; required-check names must nevertheless remain stable.

## Architecture

`quality.yml` remains the PR/main quality workflow. Its backend, frontend and Chromium jobs stay parallel where possible; Chromium continues to depend on backend and frontend. PR concurrency cancels only runs belonging to the same PR and never cancels `main` runs.

`desktop-windows.yml` remains the PR desktop validation entrypoint and keeps the existing `Windows x64 build and installed-product smoke` job name. It runs a small change-classification job first. Documentation-only PRs skip the Windows job at job level, so the workflow and check still exist and do not become permanently pending. Application, runtime, contract, Tauri, packaging and CI changes run the full desktop job. The existing NSIS 3.13 bootstrap is preserved.

The shared Windows implementation moves into `.github/workflows/desktop-certified.yml` as a `workflow_call` workflow. It accepts an explicit `commit_sha`, artifact name, retention and whether the artifact is official. It checks out exactly the supplied SHA, builds the existing installer, runs the existing native installed-product smoke, verifies the setup checksum and creates machine-readable provenance. Failed runs never upload an official artifact; diagnostics may be uploaded separately.

`main-desktop.yml` is a main-only orchestration workflow triggered by successful completion of `Forge quality`. Its guard validates repository, branch, event conclusion and exact `head_sha`, then waits in a bounded loop for the CodeQL workflow run with that same SHA to succeed. It invokes the reusable Windows workflow with the guarded SHA and the artifact name `forge-windows-x64-main-<full-sha>`. A manual dispatch requires the operator to provide the current `main` SHA and validates that it still equals `origin/main` before building.

## Trust and artifact policy

- PR code is never executed by the `workflow_run` publishing context.
- The main workflow checks out the immutable SHA from the completed trusted `main` quality run, never the moving branch head.
- Official artifacts are uploaded only after every Windows build, security, checksum and installed-product step succeeds.
- PR installers use a `forge-windows-x64-pr-...` name and are explicitly temporary validation artifacts.
- Official main artifacts include the installer, matching `.sha256`, screenshots/evidence and JSON provenance containing SHA, workflow run ID, runner, toolchain versions and certification outcome.
- No GitHub Release or tag is created.
- Artifact retention is 14 days for certified main artifacts and 7 days for PR validation artifacts.

## Change classification

The classifier is conservative. Only markdown/documentation/legal-only changes are documentation-only. Frontend, backend, migrations, contracts, Rust/Tauri, packaging, desktop scripts, lockfiles, runtime configuration and workflow changes require the desktop gate. Non-PR events always run the desktop workflow.

## Caching and efficiency decisions

Existing npm and uv caches are retained. Cargo/target caching is not introduced in this pass because the baseline has no comparable cache measurements and target caches on Windows can add restore/upload cost and stale native build risk. The reusable workflow removes future divergence between PR and main builds without changing the installed smoke. Main runs are never cancelled; PR runs are cancelled only within the same PR group.

## Verification

The implementation adds deterministic policy tests for change classification, workflow structure, exact-SHA checkout, artifact naming and failure gates. Certification runs the policy tests plus the existing backend/frontend/Chromium/secret checks and the Windows Rust, NSIS, checksum and installed-product workflow. Stage A reports PR evidence and explicitly states that no certified main artifact can be claimed until this branch is merged and the post-merge `workflow_run` completes.
