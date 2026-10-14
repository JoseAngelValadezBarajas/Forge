from __future__ import annotations

import os
import subprocess
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.context.packages import ContextPackageBuilder
from app.db import Base, get_db
from app.git.observer import GitObserver
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


def test_git_observer_fails_closed_on_timeout_and_output_limit(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    root = make_repo(tmp_path / "repo")

    def timeout(*_args: object, **_kwargs: object) -> None:
        raise subprocess.TimeoutExpired(["git"], 0.01)

    monkeypatch.setattr(subprocess, "run", timeout)
    assert GitObserver().observe(root).error_code == "TIMEOUT"

    class Result:
        returncode = 0
        stdout = "x" * 100
        stderr = ""

    monkeypatch.setattr(subprocess, "run", lambda *_args, **_kwargs: Result())
    assert GitObserver(output_limit=10).observe(root).error_code == "OUTPUT_LIMIT"


@pytest.fixture
def fnd04_client() -> Iterator[tuple[TestClient, str, str, str]]:
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
        yield client, workspace["id"], project["id"], feature["id"]
    app.dependency_overrides.clear()
    engine.dispose()


def test_fnd04_migration_models_exist() -> None:
    assert {
        "repository_connections",
        "git_observations",
        "feature_repository_links",
        "context_packages",
    }.issubset(set(Base.metadata.tables))
    assert inspect(Base.metadata) is not None


def test_repository_observation_and_deterministic_package_lifecycle(
    fnd04_client: tuple[TestClient, str, str, str], tmp_path: Path
) -> None:
    client, workspace_id, project_id, feature_id = fnd04_client
    root = make_repo(tmp_path / "forge local repo")
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


def test_archived_project_keeps_reads_but_rejects_new_observations_and_packages(
    fnd04_client: tuple[TestClient, str, str, str], tmp_path: Path
) -> None:
    client, workspace_id, project_id, feature_id = fnd04_client
    root = make_repo(tmp_path / "repo")
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
