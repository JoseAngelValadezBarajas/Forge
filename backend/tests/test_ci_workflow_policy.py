from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).parents[2]
DESKTOP_WORKFLOW = ROOT / ".github" / "workflows" / "desktop-windows.yml"
REUSABLE_WORKFLOW = ROOT / ".github" / "workflows" / "desktop-certified.yml"
MAIN_WORKFLOW = ROOT / ".github" / "workflows" / "main-desktop.yml"
QUALITY_WORKFLOW = ROOT / ".github" / "workflows" / "quality.yml"


def test_pr_desktop_workflow_keeps_check_and_classifies_at_job_level() -> None:
    workflow = DESKTOP_WORKFLOW.read_text(encoding="utf-8")

    assert "pull_request:" in workflow
    assert "paths:" not in workflow
    assert "ref: ${{ github.event.pull_request.base.sha || github.sha }}" in workflow
    assert "change-classification:" in workflow
    assert "needs: change-classification" in workflow
    assert "needs.change-classification.outputs.desktop_required == 'true'" in workflow
    assert "cancel-in-progress: ${{ github.event_name == 'pull_request' }}" in workflow


def test_pr_classifier_fails_closed_when_policy_script_is_absent_from_baseline() -> None:
    workflow = DESKTOP_WORKFLOW.read_text(encoding="utf-8")

    assert "if [[ -f scripts/ci_change_policy.py ]]; then" in workflow
    assert "desktop_required=true" in workflow
    assert "classifier is unavailable in the trusted baseline" in workflow


def test_shared_desktop_workflow_is_locked_and_checks_exact_sha() -> None:
    workflow = REUSABLE_WORKFLOW.read_text(encoding="utf-8")

    assert "workflow_call:" in workflow
    assert "commit_sha:" in workflow
    assert "ref: ${{ inputs.commit_sha }}" in workflow
    assert "cargo metadata --manifest-path desktop/src-tauri/Cargo.toml --locked" in workflow
    assert "cargo test --manifest-path desktop/src-tauri/Cargo.toml --locked" in workflow
    assert "cargo clippy --manifest-path desktop/src-tauri/Cargo.toml --locked" in workflow
    assert "cargo generate-lockfile" not in workflow
    assert "desktop-provenance.json" in workflow
    assert "if: success() && inputs.publish_certified_artifact == true" in workflow


def test_main_workflow_is_main_only_and_verifies_codeql_same_sha() -> None:
    workflow = MAIN_WORKFLOW.read_text(encoding="utf-8")

    assert "workflow_run:" in workflow
    assert "branches: [main]" in workflow
    assert "pull_request:" not in workflow
    assert "head_sha" in workflow
    assert "CodeQL" in workflow
    assert "checks: read" in workflow
    assert "actions: read" in workflow
    assert "forge-windows-x64-main-${{ needs.guard.outputs.commit_sha }}" in workflow
    assert "ref: ${{ inputs.commit_sha }}" not in workflow
    assert "continue-on-error" not in workflow
    assert "cancel-in-progress: false" in workflow


def test_quality_runs_cancel_only_superseded_prs() -> None:
    workflow = QUALITY_WORKFLOW.read_text(encoding="utf-8")

    assert "concurrency:" in workflow
    assert "group: forge-quality-${{ github.event.pull_request.number || github.ref }}" in workflow
    assert "cancel-in-progress: ${{ github.event_name == 'pull_request' }}" in workflow
