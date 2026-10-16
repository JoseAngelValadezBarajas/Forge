from __future__ import annotations

import html
import io
import json
import os
import subprocess
from collections.abc import Iterator
from pathlib import Path
from threading import Event
from typing import Any, Protocol

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, inspect
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import get_settings
from app.context.packages import ContextPackageBuilder
from app.db import Base, get_db
from app.git.observer import GitObservation, GitObserver, _GitCommandError, _GitCommandResult
from app.main import app


def test_context_builder_is_canonical_across_record_order_and_text_spacing() -> None:
    builder = ContextPackageBuilder()
    common: dict[str, Any] = {
        "project": {"name": "Forge", "description": "Local", "status": "active"},
        "feature": {
            "id": "feature",
            "key": "FEAT-001",
            "title": "Title",
            "description": None,
            "goal": "Goal",
            "priority": "high",
            "status": "ready",
        },
        "planning": {"tasks": [], "acceptance_criteria": []},
        "readiness": None,
    }
    first = builder.build(
        **common,
        dependencies=[
            {"id": "b", "blocking_feature_id": "2"},
            {"id": "a", "blocking_feature_id": "1"},
        ],
        decisions=[{"id": "d", "title": "  A\n decision "}],
        invariants=[],
        observations=[{"id": "o", "observed_at": "2026-01-01T00:00:00+00:00", "status": "ok"}],
    )
    second = builder.build(
        **common,
        dependencies=[
            {"id": "a", "blocking_feature_id": "1"},
            {"id": "b", "blocking_feature_id": "2"},
        ],
        decisions=[{"id": "d", "title": "A\n decision"}],
        invariants=[],
        observations=[{"id": "o", "observed_at": "2026-01-01T00:00:00+00:00", "status": "ok"}],
    )
    assert first.fingerprint == second.fingerprint
    assert first.canonical_json == second.canonical_json


def test_context_builder_preserves_position_order_and_complete_safe_markdown() -> None:
    builder = ContextPackageBuilder()
    snapshot = builder.build(
        project={"id": "project-42", "name": "Forge", "description": "Plan", "status": "active"},
        feature={
            "id": "feature-42",
            "key": "FEAT-042",
            "title": "Export",
            "description": "<script>alert(1)</script>",
            "goal": "Keep context",
            "priority": "high",
            "status": "ready",
        },
        planning={
            "tasks": [
                {"id": "task-b", "title": "Second", "status": "backlog", "position": 2},
                {"id": "task-a", "title": "First", "status": "done", "position": 1},
            ],
            "acceptance_criteria": [
                {"id": "criterion-b", "description": "Second", "position": 2},
                {"id": "criterion-a", "description": "First", "position": 1},
            ],
        },
        dependencies=[{"id": "dependency-1", "direction": "blocked_by"}],
        decisions=[{"id": "decision-1", "revision": 3, "title": "Use local Git"}],
        invariants=[
            {"id": "invariant-1", "acknowledged_revision": 2, "statement": "Keep it local"}
        ],
        readiness={
            "evaluation_id": "evaluation-1",
            "evaluated_at": "2026-01-01T00:00:00+00:00",
            "rule_set_version": "fnd03-v1",
            "input_fingerprint": "f" * 64,
            "outcome": "NOT_READY",
            "stale": False,
            "blockers": [{"code": "R02", "message": "Add criteria"}],
        },
        observations=[
            {
                "id": "observation-1",
                "repository_id": "repository-1",
                "observed_at": "2026-01-01T00:00:00+00:00",
                "status": "error",
                "error_code": "NOT_REPOSITORY",
            }
        ],
    )
    assert snapshot.payload["project"]["id"] == "project-42"
    assert [item["id"] for item in snapshot.payload["planning"]["tasks"]] == [
        "task-a",
        "task-b",
    ]
    assert [item["id"] for item in snapshot.payload["planning"]["acceptance_criteria"]] == [
        "criterion-a",
        "criterion-b",
    ]
    assert html.escape(snapshot.canonical_json) in snapshot.markdown
    assert "## Tasks" not in snapshot.markdown
    assert "## Planning" in snapshot.markdown
    assert "task-a" in snapshot.markdown and "task-b" in snapshot.markdown
    assert "criterion-a" in snapshot.markdown and "criterion-b" in snapshot.markdown
    assert "R02" in snapshot.markdown
    assert "NOT_REPOSITORY" in snapshot.markdown
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in snapshot.markdown

    reordered = builder.build(
        project={"id": "project-42", "name": "Forge", "description": "Plan", "status": "active"},
        feature={
            "id": "feature-42",
            "key": "FEAT-042",
            "title": "Export",
            "description": "<script>alert(1)</script>",
            "goal": "Keep context",
            "priority": "high",
            "status": "ready",
        },
        planning={
            "tasks": [
                {"id": "task-a", "title": "First", "status": "done", "position": 2},
                {"id": "task-b", "title": "Second", "status": "backlog", "position": 1},
            ],
            "acceptance_criteria": [
                {"id": "criterion-a", "description": "First", "position": 2},
                {"id": "criterion-b", "description": "Second", "position": 1},
            ],
        },
        dependencies=[{"id": "dependency-1", "direction": "blocked_by"}],
        decisions=[{"id": "decision-1", "revision": 3, "title": "Use local Git"}],
        invariants=[
            {"id": "invariant-1", "acknowledged_revision": 2, "statement": "Keep it local"}
        ],
        readiness={
            "evaluation_id": "evaluation-1",
            "evaluated_at": "2026-01-01T00:00:00+00:00",
            "rule_set_version": "fnd03-v1",
            "input_fingerprint": "f" * 64,
            "outcome": "NOT_READY",
            "stale": False,
            "blockers": [{"code": "R02", "message": "Add criteria"}],
        },
        observations=[
            {
                "id": "observation-1",
                "repository_id": "repository-1",
                "observed_at": "2026-01-01T00:00:00+00:00",
                "status": "error",
                "error_code": "NOT_REPOSITORY",
            }
        ],
    )
    assert snapshot.fingerprint != reordered.fingerprint


def git(root: Path, *args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=root,
        check=check,
        capture_output=True,
        text=True,
        env={
            **os.environ,
            "GIT_CONFIG_NOSYSTEM": "1",
            "GIT_CONFIG_GLOBAL": os.devnull,
            "GIT_TERMINAL_PROMPT": "0",
        },
    )


def make_repo(root: Path, *, commit: bool = True) -> Path:
    root.mkdir()
    git(root, "init", "--initial-branch=main")
    if commit:
        (root / "README.md").write_text("Forge fixture\n", encoding="utf-8")
        git(root, "add", "README.md")
        git(
            root,
            "-c",
            "user.name=Forge Fixture",
            "-c",
            "user.email=fixture@example.invalid",
            "commit",
            "-m",
            "fixture",
        )
    return root


def test_git_observer_reports_clean_dirty_staged_and_untracked(tmp_path: Path) -> None:
    root = make_repo(tmp_path / "repo")
    observer = GitObserver()
    clean = observer.observe(root)
    assert clean.status == "ok"
    assert clean.clean is True
    assert clean.branch == "main"
    assert clean.head_sha

    (root / "README.md").write_text("changed\n", encoding="utf-8")
    (root / "new.txt").write_text("new\n", encoding="utf-8")
    dirty = observer.observe(root)
    assert dirty.clean is False
    assert dirty.tracked_modified_count == 1
    assert dirty.untracked_count == 1
    git(root, "add", "README.md")
    staged = observer.observe(root)
    assert staged.staged_count == 1
    assert staged.tracked_modified_count == 0


def test_git_observer_handles_unborn_detached_missing_and_relative_paths(tmp_path: Path) -> None:
    unborn = make_repo(tmp_path / "unborn", commit=False)
    unborn_result = GitObserver().observe(unborn)
    assert unborn_result.status == "ok"
    assert unborn_result.unborn is True
    assert unborn_result.head_sha is None

    root = make_repo(tmp_path / "detached")
    git(root, "checkout", "--detach", "HEAD")
    detached = GitObserver().observe(root)
    assert detached.status == "ok"
    assert detached.detached is True
    assert detached.branch is None

    missing = GitObserver().observe(tmp_path / "missing")
    assert missing.status == "error"
    assert missing.error_code == "PATH_NOT_FOUND"
    relative = GitObserver().observe("relative-repository")
    assert relative.status == "error"
    assert relative.error_code == "INVALID_PATH"


class _FakeStream(Protocol):
    @property
    def closed(self) -> bool: ...

    def read(self, size: int) -> bytes: ...

    def close(self) -> None: ...


class _FakeProcess:
    def __init__(self, stdout: _FakeStream, stderr: _FakeStream, *, running: bool = True) -> None:
        self.stdout = stdout
        self.stderr = stderr
        self.returncode = None if running else 0
        self.terminated = False

    def poll(self) -> int | None:
        return self.returncode

    def wait(self, timeout: float | None = None) -> int:
        if self.returncode is None:
            raise subprocess.TimeoutExpired(["git"], timeout or 0)
        return self.returncode

    def terminate(self) -> None:
        self.terminated = True
        self.returncode = -15

    def kill(self) -> None:
        self.terminated = True
        self.returncode = -9


class _BlockingStream:
    def __init__(self) -> None:
        self.released = Event()
        self.closed = False

    def read(self, _size: int) -> bytes:
        self.released.wait()
        return b""

    def close(self) -> None:
        self.closed = True
        self.released.set()


def test_git_observer_fails_closed_on_timeout_and_output_limit(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    root = make_repo(tmp_path / "repo")

    timeout_process = _FakeProcess(_BlockingStream(), _BlockingStream())
    monkeypatch.setattr(subprocess, "Popen", lambda *_args, **_kwargs: timeout_process)
    with pytest.raises(_GitCommandError) as timeout_error:
        GitObserver(timeout_seconds=0.01)._run(root, ["status"])
    assert timeout_error.value.code == "TIMEOUT"
    assert timeout_process.terminated is True
    assert timeout_process.stdout.closed is True
    assert timeout_process.stderr.closed is True

    output_process = _FakeProcess(io.BytesIO(b"x" * 100), io.BytesIO())
    monkeypatch.setattr(subprocess, "Popen", lambda *_args, **_kwargs: output_process)
    with pytest.raises(_GitCommandError) as output_error:
        GitObserver(output_limit=10)._run(root, ["status"])
    assert output_error.value.code == "OUTPUT_LIMIT"
    assert output_process.terminated is True


def test_git_observer_checks_each_git_result_and_redacts_error_details(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    root = tmp_path / "repo"
    root.mkdir()
    observer = GitObserver()

    monkeypatch.setattr(
        observer,
        "_run",
        lambda *_args: _GitCommandResult(128, "", "fatal: not a git repository: private details"),
    )
    status_error = observer.observe(root)
    assert status_error.status == "error"
    assert status_error.clean is None
    assert status_error.error_code == "NOT_REPOSITORY"
    assert str(root) not in (status_error.error_detail or "")

    monkeypatch.setattr(
        observer,
        "_run",
        lambda *_args: _GitCommandResult(128, "", "fatal: bad object HEAD"),
    )
    assert observer.observe(root).error_code == "INVALID_REPOSITORY"

    def branch_failure(_root: Path, args: list[str]) -> _GitCommandResult:
        if args[0] == "--no-optional-locks":
            return _GitCommandResult(0, "## main...origin/main\n", "")
        return _GitCommandResult(2, "", "branch failure")

    monkeypatch.setattr(observer, "_run", branch_failure)
    assert observer.observe(root).error_code == "SYMBOLIC_REF_FAILED"

    def head_failure(_root: Path, args: list[str]) -> _GitCommandResult:
        if args[0] == "--no-optional-locks":
            return _GitCommandResult(0, "## main\n", "")
        if args[0] == "symbolic-ref":
            return _GitCommandResult(0, "main\n", "")
        return _GitCommandResult(7, "", "head failure")

    monkeypatch.setattr(observer, "_run", head_failure)
    assert observer.observe(root).error_code == "HEAD_LOOKUP_FAILED"


def test_git_observer_environment_does_not_inherit_git_selection_or_config(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    for key in (
        "GIT_DIR",
        "GIT_WORK_TREE",
        "GIT_INDEX_FILE",
        "GIT_EXEC_PATH",
        "GIT_CEILING_DIRECTORIES",
        "GIT_CONFIG_COUNT",
    ):
        monkeypatch.setenv(key, "unsafe-value")
    env = GitObserver._environment()
    assert env["GIT_CONFIG_COUNT"] == "0"
    assert env["GIT_CONFIG_NOSYSTEM"] == "1"
    assert "GIT_DIR" not in env
    assert "GIT_WORK_TREE" not in env
    assert "GIT_INDEX_FILE" not in env
    assert "GIT_EXEC_PATH" not in env
    assert "GIT_CEILING_DIRECTORIES" not in env


@pytest.fixture
def fnd04_client(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> Iterator[tuple[TestClient, str, str, str, Engine]]:
    approved_root = tmp_path / "approved"
    approved_root.mkdir()
    monkeypatch.setenv("FORGE_ALLOWED_REPOSITORY_ROOTS", json.dumps([str(approved_root)]))
    get_settings.cache_clear()
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    def override_db() -> Iterator[Session]:
        with sessions() as session:
            yield session

    app.dependency_overrides[get_db] = override_db
    with TestClient(app) as client:
        workspace = client.post("/api/workspaces", json={"name": "FND-04"}).json()
        project = client.post(
            f"/api/workspaces/{workspace['id']}/projects", json={"name": "Context"}
        ).json()
        feature = client.post(
            f"/api/workspaces/{workspace['id']}/projects/{project['id']}/features",
            json={"title": "Context package", "goal": "Preserve planning context"},
        ).json()
        yield client, workspace["id"], project["id"], feature["id"], engine
    app.dependency_overrides.clear()
    engine.dispose()
    get_settings.cache_clear()


def test_fnd04_migration_models_exist() -> None:
    assert {
        "repository_connections",
        "git_observations",
        "feature_repository_links",
        "context_packages",
    }.issubset(set(Base.metadata.tables))
    assert inspect(Base.metadata) is not None


def test_repository_observation_and_deterministic_package_lifecycle(
    fnd04_client: tuple[TestClient, str, str, str, Engine], tmp_path: Path
) -> None:
    client, workspace_id, project_id, feature_id, _engine = fnd04_client
    root = make_repo(tmp_path / "approved" / "forge local repo")
    base = f"/api/workspaces/{workspace_id}/projects/{project_id}"
    connected = client.post(f"{base}/repositories", json={"root_path": str(root)})
    assert connected.status_code == 201
    repository_id = connected.json()["id"]
    observed = client.post(f"{base}/repositories/{repository_id}/observe")
    assert observed.status_code == 200
    assert observed.json()["status"] == "ok"
    assert "root_path" not in observed.json()
    assert (
        client.post(
            f"{base}/features/{feature_id}/repositories", json={"repository_id": repository_id}
        ).status_code
        == 201
    )

    preview = client.post(f"{base}/features/{feature_id}/context/preview")
    assert preview.status_code == 200
    preview_json = preview.json()
    assert preview_json["schema_version"] == "forge-context-v1"
    assert preview_json["payload"]["git_observations"][0]["id"] == observed.json()["id"]
    assert "root_path" not in preview.text
    assert "remotes" not in preview.text
    saved = client.post(f"{base}/features/{feature_id}/context/packages")
    assert saved.status_code == 201
    package_id = saved.json()["id"]
    same = client.post(f"{base}/features/{feature_id}/context/packages")
    assert same.status_code == 201
    assert same.json()["id"] == package_id

    (root / "new.txt").write_text("change\n", encoding="utf-8")
    changed_observation = client.post(f"{base}/repositories/{repository_id}/observe").json()
    changed = client.post(f"{base}/features/{feature_id}/context/packages").json()
    assert changed["id"] != package_id
    assert changed["fingerprint"] != saved.json()["fingerprint"]
    assert changed_observation["id"] != observed.json()["id"]
    assert len(client.get(f"{base}/features/{feature_id}/context/packages").json()) == 2

    assert client.post(f"{base}/repositories/{repository_id}/disconnect").status_code == 200
    assert (
        client.get(f"{base}/features/{feature_id}/context/packages/{package_id}").status_code == 200
    )
    assert (
        client.get(
            f"{base}/features/{feature_id}/context/packages/{package_id}/download",
            params={"format": "markdown"},
        )
        .headers["content-type"]
        .startswith("text/markdown")
    )
    json_download = client.get(
        f"{base}/features/{feature_id}/context/packages/{package_id}/download",
        params={"format": "json"},
    )
    assert json_download.headers["content-type"].startswith("application/json")
    assert json_download.json()["schema"] == "forge-context-v1"


def test_repository_connection_rejects_path_outside_approved_root(
    fnd04_client: tuple[TestClient, str, str, str, Engine], tmp_path: Path
) -> None:
    client, workspace_id, project_id, _feature_id, _engine = fnd04_client
    outside_repo = make_repo(tmp_path / "outside")
    base = f"/api/workspaces/{workspace_id}/projects/{project_id}"

    response = client.post(
        f"{base}/repositories", json={"root_path": str(outside_repo)}
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "Repository path must be within an approved local root"


def test_archived_project_keeps_reads_but_rejects_new_observations_and_packages(
    fnd04_client: tuple[TestClient, str, str, str, Engine], tmp_path: Path
) -> None:
    client, workspace_id, project_id, feature_id, _engine = fnd04_client
    root = make_repo(tmp_path / "approved" / "repo")
    base = f"/api/workspaces/{workspace_id}/projects/{project_id}"
    repository_id = client.post(f"{base}/repositories", json={"root_path": str(root)}).json()["id"]
    client.post(f"{base}/repositories/{repository_id}/observe")
    client.post(f"{base}/features/{feature_id}/repositories", json={"repository_id": repository_id})
    saved = client.post(f"{base}/features/{feature_id}/context/packages")
    assert saved.status_code == 201
    assert (
        client.post(f"/api/workspaces/{workspace_id}/projects/{project_id}/archive").status_code
        == 200
    )
    assert client.get(f"{base}/repositories").status_code == 200
    assert client.get(f"{base}/repositories/{repository_id}/observations").status_code == 200
    assert client.post(f"{base}/repositories/{repository_id}/observe").status_code == 422
    assert client.post(f"{base}/features/{feature_id}/context/packages").status_code == 422
    assert (
        client.get(f"{base}/features/{feature_id}/context/packages").json()[0]["id"]
        == saved.json()["id"]
    )


def _assert_rejected_observation_is_read_only(
    *,
    client: TestClient,
    engine: Engine,
    monkeypatch: pytest.MonkeyPatch,
    base: str,
    repository_id: str,
    original_observation_id: str,
) -> None:
    writes: list[str] = []

    def record_write(
        _connection: object,
        _cursor: object,
        statement: str,
        _parameters: object,
        _context: object,
        _executemany: bool,
    ) -> None:
        operation = statement.lstrip().split(maxsplit=1)[0].upper()
        if operation in {"INSERT", "UPDATE", "DELETE", "REPLACE"}:
            writes.append(operation)

    def unexpected_git_observation(_observer: GitObserver, _root: Path) -> GitObservation:
        pytest.fail("GitObserver must not be called for a path outside current approved roots")

    event.listen(engine, "before_cursor_execute", record_write)
    monkeypatch.setattr(GitObserver, "observe", unexpected_git_observation)
    try:
        rejected = client.post(f"{base}/repositories/{repository_id}/observe")
    finally:
        event.remove(engine, "before_cursor_execute", record_write)

    assert rejected.status_code == 422
    assert rejected.json()["detail"] == "Repository path must be within an approved local root"
    assert writes == []

    # Restricting future observations must not hide or mutate existing records.
    connections = client.get(f"{base}/repositories")
    observations = client.get(f"{base}/repositories/{repository_id}/observations")
    assert connections.status_code == 200
    assert any(item["id"] == repository_id for item in connections.json())
    assert observations.status_code == 200
    assert [item["id"] for item in observations.json()] == [original_observation_id]


def test_existing_repository_observation_revalidates_stored_path_outside_roots(
    fnd04_client: tuple[TestClient, str, str, str, Engine], tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, workspace_id, project_id, _feature_id, engine = fnd04_client
    base = f"/api/workspaces/{workspace_id}/projects/{project_id}"
    root = make_repo(tmp_path / "approved" / "repo")
    repository_id = client.post(f"{base}/repositories", json={"root_path": str(root)}).json()["id"]
    initial = client.post(f"{base}/repositories/{repository_id}/observe")
    assert initial.status_code == 200

    outside_parent = tmp_path / "outside"
    outside_parent.mkdir()
    outside = make_repo(outside_parent / "repo")
    with engine.begin() as connection:
        connection.exec_driver_sql(
            "UPDATE repository_connections SET root_path = ? WHERE id = ?",
            (str(outside), repository_id),
        )

    _assert_rejected_observation_is_read_only(
        client=client,
        engine=engine,
        monkeypatch=monkeypatch,
        base=base,
        repository_id=repository_id,
        original_observation_id=initial.json()["id"],
    )


def test_existing_repository_observation_uses_updated_allowed_roots(
    fnd04_client: tuple[TestClient, str, str, str, Engine], tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, workspace_id, project_id, _feature_id, engine = fnd04_client
    base = f"/api/workspaces/{workspace_id}/projects/{project_id}"
    root = make_repo(tmp_path / "approved" / "repo")
    repository_id = client.post(f"{base}/repositories", json={"root_path": str(root)}).json()["id"]
    initial = client.post(f"{base}/repositories/{repository_id}/observe")
    assert initial.status_code == 200

    new_root = tmp_path / "newly-approved"
    new_root.mkdir()
    monkeypatch.setenv("FORGE_ALLOWED_REPOSITORY_ROOTS", json.dumps([str(new_root)]))
    get_settings.cache_clear()

    _assert_rejected_observation_is_read_only(
        client=client,
        engine=engine,
        monkeypatch=monkeypatch,
        base=base,
        repository_id=repository_id,
        original_observation_id=initial.json()["id"],
    )


def test_existing_repository_observation_rejects_symlink_escape(
    fnd04_client: tuple[TestClient, str, str, str, Engine], tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, workspace_id, project_id, _feature_id, engine = fnd04_client
    base = f"/api/workspaces/{workspace_id}/projects/{project_id}"
    root = make_repo(tmp_path / "approved" / "repo")
    repository_id = client.post(f"{base}/repositories", json={"root_path": str(root)}).json()["id"]
    initial = client.post(f"{base}/repositories/{repository_id}/observe")
    assert initial.status_code == 200

    outside_parent = tmp_path / "outside"
    outside_parent.mkdir()
    outside = make_repo(outside_parent / "repo")
    moved_root = root.with_name("repo-original")
    root.rename(moved_root)
    try:
        root.symlink_to(outside, target_is_directory=True)
    except OSError as exc:
        pytest.skip(f"Directory symlinks are unavailable in this environment: {exc}")

    _assert_rejected_observation_is_read_only(
        client=client,
        engine=engine,
        monkeypatch=monkeypatch,
        base=base,
        repository_id=repository_id,
        original_observation_id=initial.json()["id"],
    )
