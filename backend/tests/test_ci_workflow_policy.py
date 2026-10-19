from __future__ import annotations

from pathlib import Path

import pytest
from scripts.main_certification_policy import (
    CertificationPolicyError,
    classify_quality_runs,
    resolve_workflow_id,
    validate_certification_event,
)

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
    assert "EVENT_WORKFLOW_NAME" in workflow
    assert "python scripts/main_certification_policy.py" in workflow
    assert "--quality-runs-file" in workflow
    assert (
        'select(.name == "Forge quality" and .path == ".github/workflows/quality.yml")'
        in workflow
    )
    assert "head_branch" in workflow
    assert "CodeQL" in workflow
    assert (
        'select(.name == "CodeQL" and .path == "dynamic/github-code-scanning/codeql")'
        in workflow
    )
    assert "Expected exactly one CodeQL workflow at dynamic/github-code-scanning/codeql" in workflow
    assert "checks: read" in workflow
    assert "actions: read" in workflow
    assert "forge-windows-x64-main-${{ needs.guard.outputs.commit_sha }}" in workflow
    assert "ref: ${{ inputs.commit_sha }}" not in workflow
    assert "continue-on-error" not in workflow
    assert "cancel-in-progress: false" in workflow


def test_main_guard_checks_out_validated_commit_before_running_policy_code() -> None:
    workflow = MAIN_WORKFLOW.read_text(encoding="utf-8")

    validation_index = workflow.index("id: validate")
    checkout_index = workflow.index("- name: Checkout validated certification commit")
    policy_index = workflow.index("python scripts/main_certification_policy.py")

    assert validation_index < checkout_index < policy_index
    assert (
        "python scripts/main_certification_policy.py"
        not in workflow[validation_index:checkout_index]
    )
    checkout_block = workflow[checkout_index:policy_index]
    assert "uses: actions/checkout@v4" in checkout_block
    assert "ref: main" in checkout_block
    assert "ref: ${{ steps.validate.outputs.commit_sha }}" not in checkout_block
    assert "fetch-depth: 1" in checkout_block
    assert "persist-credentials: false" in checkout_block
    assert 'actual_sha="$(git rev-parse HEAD)"' in checkout_block
    assert '[[ "${actual_sha,,}" == "${CERTIFIED_SHA,,}" ]]' in checkout_block
    assert "[[ -f scripts/main_certification_policy.py ]]" in checkout_block


@pytest.mark.parametrize(
    ("runs", "state"),
    [
        (
            [
                {
                    "head_sha": "a" * 40,
                    "head_branch": "main",
                    "status": "completed",
                    "conclusion": "failure",
                }
            ],
            "failed",
        ),
        (
            [
                {
                    "head_sha": "a" * 40,
                    "head_branch": "main",
                    "status": "in_progress",
                    "conclusion": None,
                }
            ],
            "pending",
        ),
        ([], "absent"),
    ],
)
def test_manual_dispatch_cannot_certify_without_successful_quality(
    runs: list[dict[str, object]], state: str
) -> None:
    sha = "a" * 40

    assert classify_quality_runs(runs, sha, "main") == state
    with pytest.raises(CertificationPolicyError, match="quality"):
        validate_certification_event(
            event_name="workflow_dispatch",
            repository="JoseAngelValadezBarajas/Forge",
            event_repository=None,
            event_branch=None,
            event_conclusion=None,
            event_workflow_name=None,
            event_sha=None,
            manual_sha=sha,
            current_main_sha=sha,
            quality_runs=runs,
        )


def test_manual_dispatch_accepts_only_successful_quality_on_current_main() -> None:
    sha = "b" * 40

    assert validate_certification_event(
        event_name="workflow_dispatch",
        repository="JoseAngelValadezBarajas/Forge",
        event_repository=None,
        event_branch=None,
        event_conclusion=None,
        event_workflow_name=None,
        event_sha=None,
        manual_sha=sha,
        current_main_sha=sha,
        quality_runs=[
            {"head_sha": sha, "head_branch": "main", "status": "completed", "conclusion": "success"}
        ],
    ) == sha


def test_automatic_completion_also_requires_successful_quality_event() -> None:
    sha = "c" * 40

    assert validate_certification_event(
        event_name="workflow_run",
        repository="JoseAngelValadezBarajas/Forge",
        event_repository="JoseAngelValadezBarajas/Forge",
        event_branch="main",
        event_conclusion="success",
        event_workflow_name="Forge quality",
        event_sha=sha,
        manual_sha=None,
        current_main_sha=None,
        quality_runs=[
            {"head_sha": sha, "head_branch": "main", "status": "completed", "conclusion": "success"}
        ],
    ) == sha


def test_codeql_resolution_requires_verified_dynamic_workflow_path() -> None:
    workflows = [
        {
            "id": "dynamic-codeql-id",
            "name": "CodeQL",
            "path": "dynamic/github-code-scanning/codeql",
        },
        {"id": "quality-id", "name": "Forge quality", "path": ".github/workflows/quality.yml"},
    ]

    assert (
        resolve_workflow_id(
            workflows,
            name="CodeQL",
            path="dynamic/github-code-scanning/codeql",
        )
        == "dynamic-codeql-id"
    )


def test_codeql_resolution_fails_closed_for_missing_or_ambiguous_workflow() -> None:
    with pytest.raises(CertificationPolicyError, match="CodeQL"):
        resolve_workflow_id([], name="CodeQL", path="dynamic/github-code-scanning/codeql")

    with pytest.raises(CertificationPolicyError, match="exactly one"):
        resolve_workflow_id(
            [
                {"id": 1, "name": "CodeQL", "path": "dynamic/github-code-scanning/codeql"},
                {"id": 2, "name": "CodeQL", "path": "dynamic/github-code-scanning/codeql"},
            ],
            name="CodeQL",
            path="dynamic/github-code-scanning/codeql",
        )


def test_quality_runs_cancel_only_superseded_prs() -> None:
    workflow = QUALITY_WORKFLOW.read_text(encoding="utf-8")

    assert "concurrency:" in workflow
    assert "group: forge-quality-${{ github.event.pull_request.number || github.ref }}" in workflow
    assert "cancel-in-progress: ${{ github.event_name == 'pull_request' }}" in workflow
