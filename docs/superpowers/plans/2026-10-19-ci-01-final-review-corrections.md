# CI-01 Final Review Corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure the main desktop certification guard requires successful Quality and CodeQL evidence for the exact `main` SHA for both automatic and manual triggers.

**Architecture:** Keep the existing workflow orchestration and reusable Windows job. Add a small pure policy module for exact-SHA event and run-state decisions, call it from the guard, and keep workflow discovery fail-closed by stable workflow name and path. Branch protection remains an operator-owned GitHub setting and is only inspected, not mutated.

**Tech Stack:** GitHub Actions, Bash, GitHub CLI, Python 3.12, pytest.

**Spec:** CI-01 final tech-lead review.

## Global Constraints

- Do not change application behavior, desktop packaging, licenses, release state or merge state.
- Require exact SHA and `main` branch for Quality and CodeQL evidence.
- Fail closed when required workflow evidence is failed, pending or absent.
- Do not hardcode GitHub run IDs.

## Review Focus

- Manual dispatch with failed, pending or absent Quality must be rejected by policy tests.
- Automatic workflow completion must still validate the originating successful Quality run.
- CodeQL discovery must match the verified dynamic workflow path exactly.
- Windows check-name compatibility and branch protection must be reported without silently weakening requirements.

### Task 1: Exact-SHA certification policy

**Files:**
- Create: `scripts/main_certification_policy.py`
- Test: `backend/tests/test_ci_workflow_policy.py`

- [ ] Add failing tests for the manual Quality states and stable CodeQL workflow resolution.
- [ ] Implement the pure policy decisions and run the focused tests.

### Task 2: Main workflow guard

**Files:**
- Modify: `.github/workflows/main-desktop.yml`
- Test: `backend/tests/test_ci_workflow_policy.py`

- [ ] Require Quality success for both trigger paths and resolve CodeQL by name plus dynamic path.
- [ ] Add static guard regressions and run the focused policy suite.

### Task 3: Protection evidence and certification

**Files:**
- Modify: `docs/engineering/ci-01-pipeline-architecture.md`

- [ ] Record the verified check names and the current branch-protection limitation.
- [ ] Run the complete applicable local and remote checks, then commit and push the focused corrections.
