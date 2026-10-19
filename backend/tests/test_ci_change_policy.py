from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parents[2]
SCRIPT = ROOT / "scripts" / "ci_change_policy.py"


def run_policy(tmp_path: Path, event: str, paths: list[str]) -> dict[str, str]:
    paths_file = tmp_path / "paths.txt"
    paths_file.write_text("\n".join(paths) + "\n", encoding="utf-8")
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--event", event, "--paths-file", str(paths_file)],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    return dict(line.split("=", 1) for line in result.stdout.splitlines() if "=" in line)


def test_documentation_only_pull_request_can_skip_desktop(tmp_path: Path) -> None:
    output = run_policy(
        tmp_path,
        "pull_request",
        ["README.md", "docs/engineering/ci-01-pipeline-architecture.md", "NOTICE"],
    )

    assert output["desktop_required"] == "false"
    assert output["classification"] == "docs-only"


def test_frontend_pull_request_requires_desktop(tmp_path: Path) -> None:
    output = run_policy(tmp_path, "pull_request", ["frontend/src/App.tsx"])

    assert output["desktop_required"] == "true"
    assert output["classification"] == "desktop-sensitive"


def test_backend_and_migration_pull_request_requires_desktop(tmp_path: Path) -> None:
    output = run_policy(
        tmp_path,
        "pull_request",
        ["backend/app/api/routes.py", "backend/migrations/versions/1234_add_field.py"],
    )

    assert output["desktop_required"] == "true"


def test_tauri_packaging_and_workflow_changes_require_desktop_independently(
    tmp_path: Path,
) -> None:
    for path in (
        "desktop/src-tauri/src/route_policy.rs",
        ".github/workflows/desktop-windows.yml",
        "scripts/installed_desktop_smoke.mjs",
        "desktop/src-tauri/Cargo.lock",
    ):
        output = run_policy(tmp_path, "pull_request", [path])
        assert output["desktop_required"] == "true", path


def test_non_pull_request_events_always_require_desktop(tmp_path: Path) -> None:
    output = run_policy(tmp_path, "push", ["README.md"])

    assert output["desktop_required"] == "true"
    assert output["classification"] == "non-pr-event"
