from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect
from sqlalchemy.engine import Engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.application.services import DuplicateName, WorkspaceService, ensure_local_workspace
from app.config import get_settings, sqlite_url
from app.db import Base, get_db
from app.main import app
from app.persistence.models import WorkspaceModel


def sqlite_index_names(engine: Engine) -> set[str]:
    with engine.connect() as connection:
        rows = connection.exec_driver_sql("PRAGMA index_list('workspaces')").fetchall()
    return {str(row[1]) for row in rows}


@pytest.fixture
def database(tmp_path: Path) -> Iterator[tuple[Engine, Session]]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    def override_db() -> Iterator[Session]:
        with sessions() as session:
            yield session

    app.dependency_overrides[get_db] = override_db
    with Session(engine) as session:
        yield engine, session
    app.dependency_overrides.clear()
    engine.dispose()


def seed(database: tuple[Engine, Session]) -> str:
    _, session = database
    first = ensure_local_workspace(session)
    first_id = first.id
    second = ensure_local_workspace(session)
    assert second.id == first_id
    return first_id


def test_seed_is_idempotent_and_workspace_crud(database: tuple[Engine, Session]) -> None:
    workspace_id = seed(database)
    with TestClient(app) as client:
        response = client.get("/api/workspaces")
        assert response.status_code == 200
        assert len(response.json()) == 1
        created = client.post("/api/workspaces", json={"name": "Research"})
        assert created.status_code == 201
        assert client.patch(
            f"/api/workspaces/{created.json()['id']}",
            json={"description": "A second local space"},
        ).status_code == 200
        assert client.get(f"/api/workspaces/{workspace_id}").status_code == 200


def test_project_lifecycle_duplicate_policy_search_and_isolation(
    database: tuple[Engine, Session],
) -> None:
    workspace_id = seed(database)
    with TestClient(app) as client:
        other = client.post("/api/workspaces", json={"name": "Other Workspace"}).json()
        created = client.post(
            f"/api/workspaces/{workspace_id}/projects",
            json={"name": "Forge Core", "description": "Workspace foundation"},
        )
        assert created.status_code == 201
        project = created.json()
        duplicate = client.post(
            f"/api/workspaces/{workspace_id}/projects",
            json={"name": " forge core "},
        )
        assert duplicate.status_code == 409
        allowed_in_other = client.post(
            f"/api/workspaces/{other['id']}/projects", json={"name": "Forge Core"}
        )
        assert allowed_in_other.status_code == 201
        assert client.get(
            f"/api/workspaces/{workspace_id}/projects", params={"search": "foundation"}
        ).json()[0]["id"] == project["id"]
        assert client.patch(
            f"/api/workspaces/{workspace_id}/projects/{project['id']}",
            json={"name": "Forge Core Updated"},
        ).json()["name"] == "Forge Core Updated"
        assert client.post(
            f"/api/workspaces/{workspace_id}/projects/{project['id']}/archive"
        ).json()["status"] == "archived"
        assert client.get(
            f"/api/workspaces/{workspace_id}/projects", params={"status": "active"}
        ).json() == []
        assert client.post(
            f"/api/workspaces/{workspace_id}/projects/{project['id']}/restore"
        ).json()["status"] == "active"
        assert client.get(
            f"/api/workspaces/{other['id']}/projects/{project['id']}"
        ).status_code == 404


def test_invalid_input_and_cross_origin_mutation_are_rejected(
    database: tuple[Engine, Session],
) -> None:
    workspace_id = seed(database)
    with TestClient(app) as client:
        assert client.post(
            f"/api/workspaces/{workspace_id}/projects", json={"name": " "}
        ).status_code == 422
        assert client.post(
            "/api/workspaces",
            json={"name": "Blocked"},
            headers={"Origin": "https://untrusted.invalid"},
        ).status_code == 403


def test_migration_creates_schema_on_empty_sqlite(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    database_path = tmp_path / "empty.db"
    monkeypatch.setenv("FORGE_DATABASE_URL", sqlite_url(database_path))
    get_settings.cache_clear()
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    command.upgrade(config, "head")
    engine = create_engine(sqlite_url(database_path))
    inspector = inspect(engine)
    assert {"workspaces", "projects"}.issubset(set(inspector.get_table_names()))
    assert "uq_workspaces_name_ci" in sqlite_index_names(engine)
    engine.dispose()
    get_settings.cache_clear()


def test_incremental_migrations_upgrade_existing_sqlite_to_head(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    database_path = tmp_path / "incremental.db"
    monkeypatch.setenv("FORGE_DATABASE_URL", sqlite_url(database_path))
    get_settings.cache_clear()
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))

    command.upgrade(config, "20261013_0001")
    engine = create_engine(sqlite_url(database_path))
    with engine.connect() as connection:
        assert (
            connection.exec_driver_sql("SELECT version_num FROM alembic_version").scalar_one()
            == "20261013_0001"
        )
        assert {"workspaces", "projects"}.issubset(set(inspect(connection).get_table_names()))
    engine.dispose()

    command.upgrade(config, "head")
    engine = create_engine(sqlite_url(database_path))
    with engine.connect() as connection:
        assert (
            connection.exec_driver_sql("SELECT version_num FROM alembic_version").scalar_one()
            == "20261014_0007"
        )
        assert {
            "workspaces", "projects", "decisions", "readiness_evaluations",
            "repository_connections", "agent_runs", "handoffs", "evidence_records",
            "release_candidates",
        }.issubset(set(inspect(connection).get_table_names()))
    engine.dispose()
    get_settings.cache_clear()


def test_workspace_index_rejects_case_only_duplicate(database: tuple[Engine, Session]) -> None:
    engine, session = database
    session.add(WorkspaceModel(name="Case Space"))
    session.commit()
    session.add(WorkspaceModel(name="case space"))
    with pytest.raises(IntegrityError):
        session.commit()
    session.rollback()
    assert "uq_workspaces_name_ci" in sqlite_index_names(engine)


def test_concurrent_workspace_creates_allow_only_one_name(tmp_path: Path) -> None:
    engine = create_engine(
        sqlite_url(tmp_path / "concurrent.db"),
        connect_args={"check_same_thread": False, "timeout": 10},
    )
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    barrier = Barrier(2)

    def create_workspace() -> str:
        with sessions() as session:
            barrier.wait()
            try:
                WorkspaceService(session).create("Concurrent Space", None)
            except DuplicateName:
                return "duplicate"
            return "created"

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _: create_workspace(), range(2)))

    assert sorted(results) == ["created", "duplicate"]
    with Session(engine) as session:
        assert session.query(WorkspaceModel).count() == 1
    engine.dispose()
