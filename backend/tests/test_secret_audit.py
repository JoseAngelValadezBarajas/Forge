from __future__ import annotations

import subprocess
from pathlib import Path

import pytest
from scripts import audit_secrets


def git(repo: Path, *args: str) -> None:
    subprocess.run(
        ["git", "-C", str(repo), *args],
        check=True,
        capture_output=True,
        text=True,
    )


def init_repo(tmp_path: Path) -> Path:
    repo = tmp_path / "repo"
    repo.mkdir()
    git(repo, "init", "--initial-branch=main")
    git(repo, "config", "user.email", "forge-tests@example.invalid")
    git(repo, "config", "user.name", "Forge tests")
    (repo / "README.md").write_text("clean\n", encoding="utf-8")
    git(repo, "add", "README.md")
    git(repo, "commit", "-m", "initial")
    return repo


def commit_file(repo: Path, name: str, content: str, message: str) -> None:
    (repo / name).write_text(content, encoding="utf-8")
    git(repo, "add", name)
    git(repo, "commit", "-m", message)


def test_clean_repository_has_no_findings(tmp_path: Path) -> None:
    repo = init_repo(tmp_path)

    report = audit_secrets.scan_repository(repo)

    assert report.findings == ()
    assert report.commits == 1
    assert report.index_files == 1


def test_secret_in_head_is_reported_without_value(tmp_path: Path) -> None:
    repo = init_repo(tmp_path)
    secret = "ghp_" + "A" * 20
    commit_file(repo, "token.txt", secret + "\n", "add token")

    report = audit_secrets.scan_repository(repo)

    assert any(finding.scope == "history" for finding in report.findings)
    assert secret not in " ".join(finding.context for finding in report.findings)
    assert all("<REDACTED>" in finding.context for finding in report.findings)


def test_secret_only_in_old_commit_is_still_reported(tmp_path: Path) -> None:
    repo = init_repo(tmp_path)
    commit_file(repo, "history.txt", "api_key = \"" + "B" * 12 + "\"\n", "old secret")
    commit_file(repo, "history.txt", "clean\n", "remove secret")

    report = audit_secrets.scan_repository(repo)

    assert any(finding.scope == "history" for finding in report.findings)


def test_staged_secret_is_reported(tmp_path: Path) -> None:
    repo = init_repo(tmp_path)
    (repo / "staged.txt").write_text("password = \"" + "C" * 12 + "\"\n", encoding="utf-8")
    git(repo, "add", "staged.txt")

    report = audit_secrets.scan_repository(repo)

    assert any(finding.scope == "index" for finding in report.findings)


def test_untracked_nonignored_secret_is_reported(tmp_path: Path) -> None:
    repo = init_repo(tmp_path)
    (repo / "untracked.txt").write_text(
        "access_token = \"" + "D" * 12 + "\"\n", encoding="utf-8"
    )

    report = audit_secrets.scan_repository(repo)

    assert any(finding.scope == "worktree" for finding in report.findings)


def test_binary_files_are_skipped_and_counted(tmp_path: Path) -> None:
    repo = init_repo(tmp_path)
    (repo / "binary.dat").write_bytes(b"\x00ghp_" + b"E" * 20)

    report = audit_secrets.scan_repository(repo)

    assert report.findings == ()
    assert report.binary_files_skipped >= 1


def test_git_errors_are_explicit() -> None:
    with pytest.raises(audit_secrets.AuditError, match="Git command failed"):
        audit_secrets.run_git(Path.cwd(), "command-that-does-not-exist")


def test_invalid_pattern_is_explicit() -> None:
    with pytest.raises(audit_secrets.AuditError, match="invalid secret pattern"):
        audit_secrets.compile_patterns((("broken", "["),))


def test_audit_does_not_depend_on_current_working_directory(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repo = init_repo(tmp_path)
    outside = tmp_path / "outside"
    outside.mkdir()
    monkeypatch.chdir(outside)
    monkeypatch.setattr(audit_secrets, "DEFAULT_REPO_ROOT", repo)

    assert audit_secrets.main([]) == 0
