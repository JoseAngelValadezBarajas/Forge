"""Fail-closed policy decisions for the main desktop certification guard."""

from __future__ import annotations

import argparse
import json
import re
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

SHA_PATTERN = re.compile(r"^[0-9a-fA-F]{40}$")


class CertificationPolicyError(ValueError):
    """Raised when the evidence is insufficient for main certification."""


def _normalize_sha(value: str | None, *, label: str) -> str:
    if value is None or not SHA_PATTERN.fullmatch(value):
        raise CertificationPolicyError(f"{label} must be a full 40-character commit SHA.")
    return value.lower()


def _run_matches(run: Mapping[str, object], sha: str, branch: str) -> bool:
    return run.get("head_sha") == sha and run.get("head_branch") == branch


def classify_quality_runs(
    runs: Sequence[Mapping[str, object]], sha: str, branch: str
) -> str:
    """Classify exact-SHA runs as success, failed, pending or absent."""

    matching = [run for run in runs if _run_matches(run, sha, branch)]
    if any(run.get("conclusion") == "success" for run in matching):
        return "success"
    if any(run.get("status") != "completed" for run in matching):
        return "pending"
    if matching:
        return "failed"
    return "absent"


def validate_certification_event(
    *,
    event_name: str,
    repository: str,
    event_repository: str | None,
    event_branch: str | None,
    event_conclusion: str | None,
    event_workflow_name: str | None,
    event_sha: str | None,
    manual_sha: str | None,
    current_main_sha: str | None,
    quality_runs: Sequence[Mapping[str, object]],
) -> str:
    """Return the exact SHA only when the event and Quality evidence are valid."""

    if event_name == "workflow_run":
        if event_repository != repository:
            raise CertificationPolicyError("Quality workflow_run came from another repository.")
        if event_branch != "main":
            raise CertificationPolicyError("Quality workflow_run is not from main.")
        if event_conclusion != "success":
            raise CertificationPolicyError(f"Forge quality did not pass: {event_conclusion}.")
        if event_workflow_name != "Forge quality":
            raise CertificationPolicyError("workflow_run is not Forge quality.")
        sha = _normalize_sha(event_sha, label="workflow_run head_sha")
    elif event_name == "workflow_dispatch":
        sha = _normalize_sha(manual_sha, label="Manual SHA")
        main_sha = _normalize_sha(current_main_sha, label="Current main SHA")
        if sha != main_sha:
            raise CertificationPolicyError(f"Manual SHA is not the current main SHA: {main_sha}.")
    else:
        raise CertificationPolicyError(f"Unsupported event: {event_name}.")

    quality_state = classify_quality_runs(quality_runs, sha, "main")
    if quality_state != "success":
        message = (
            f"Forge quality evidence for {sha} on main is {quality_state}; "
            "certification requires success."
        )
        raise CertificationPolicyError(message)
    return sha


def resolve_workflow_id(
    workflows: Sequence[Mapping[str, object]], *, name: str, path: str
) -> str:
    """Resolve one workflow by its stable name and path, never by a run ID."""

    matches = [
        str(workflow["id"])
        for workflow in workflows
        if workflow.get("name") == name and workflow.get("path") == path
    ]
    if len(matches) != 1:
        raise CertificationPolicyError(
            f"Expected exactly one {name} workflow at {path}, found {len(matches)}."
        )
    return matches[0]


def _load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--event-name", required=True)
    parser.add_argument("--repository", required=True)
    parser.add_argument("--event-repository")
    parser.add_argument("--event-branch")
    parser.add_argument("--event-conclusion")
    parser.add_argument("--event-workflow-name")
    parser.add_argument("--event-sha")
    parser.add_argument("--manual-sha")
    parser.add_argument("--current-main-sha")
    parser.add_argument("--quality-runs-file", type=Path, required=True)
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    payload = _load_json(args.quality_runs_file)
    runs = payload["workflow_runs"]
    sha = validate_certification_event(
        event_name=args.event_name,
        repository=args.repository,
        event_repository=args.event_repository,
        event_branch=args.event_branch,
        event_conclusion=args.event_conclusion,
        event_workflow_name=args.event_workflow_name,
        event_sha=args.event_sha,
        manual_sha=args.manual_sha,
        current_main_sha=args.current_main_sha,
        quality_runs=runs,
    )
    print(f"commit_sha={sha}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
