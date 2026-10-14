from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app


@pytest.fixture
def planning_client() -> Iterator[tuple[TestClient, str, str]]:
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
    with TestClient(app) as client:
        workspace = client.post("/api/workspaces", json={"name": "Planning"}).json()
        project = client.post(
            f"/api/workspaces/{workspace['id']}/projects", json={"name": "Forge"}
        ).json()
        other_project = client.post(
            f"/api/workspaces/{workspace['id']}/projects", json={"name": "Other"}
        ).json()
        yield client, project["id"], other_project["id"]
    app.dependency_overrides.clear()
    engine.dispose()


def test_planning_schema_has_all_entities(planning_client: tuple[TestClient, str, str]) -> None:
    _client, _project_id, _other_project_id = planning_client
    # The ORM metadata is the source of truth for the isolated test database.
    assert {
        "epics",
        "features",
        "tasks",
        "acceptance_criteria",
        "feature_dependencies",
    }.issubset(set(Base.metadata.tables))


def test_feature_id_hierarchy_and_isolation(
    planning_client: tuple[TestClient, str, str],
) -> None:
    client, project_id, other_project_id = planning_client
    workspace_id = client.get("/api/workspaces").json()[0]["id"]
    root = f"/api/workspaces/{workspace_id}/projects/{project_id}"
    other_root = f"/api/workspaces/{workspace_id}/projects/{other_project_id}"

    epic = client.post(f"{root}/epics", json={"title": "First epic"})
    assert epic.status_code == 201
    first = client.post(f"{root}/features", json={"title": "First feature"})
    second = client.post(f"{root}/features", json={"title": "Second feature"})
    assert first.status_code == 201 and second.status_code == 201
    assert first.json()["key"] == "FEAT-001"
    assert second.json()["readable_id"] == "FEAT-002"

    attached = client.patch(
        f"{root}/features/{first.json()['id']}",
        json={"epic_id": epic.json()["id"]},
    )
    assert attached.status_code == 200
    assert attached.json()["epic_id"] == epic.json()["id"]
    assert client.get(f"{other_root}/features/{first.json()['id']}").status_code == 404
    assert client.get("/api/workspaces/invalid/projects/nope/features").status_code == 404


def test_tasks_criteria_overview_and_archived_read_only(
    planning_client: tuple[TestClient, str, str],
) -> None:
    client, project_id, _other_project_id = planning_client
    workspace_id = client.get("/api/workspaces").json()[0]["id"]
    root = f"/api/workspaces/{workspace_id}/projects/{project_id}"
    feature = client.post(f"{root}/features", json={"title": "Ship planning"}).json()
    task = client.post(
        f"{root}/features/{feature['id']}/tasks", json={"title": "Write API"}
    )
    criterion = client.post(
        f"{root}/features/{feature['id']}/acceptance-criteria",
        json={"description": "The plan is persisted"},
    )
    assert task.status_code == 201 and task.json()["position"] == 0
    assert criterion.status_code == 201
    assert client.patch(
        f"{root}/features/{feature['id']}/acceptance-criteria/{criterion.json()['id']}",
        json={"satisfied": True},
    ).json()["satisfied"] is True
    overview = client.get(f"{root}/planning/overview").json()
    assert overview == {
        "epics": 0,
        "features": 1,
        "tasks": 1,
        "acceptance_criteria": 1,
        "satisfied_criteria": 1,
        "dependencies": 0,
    }
    assert (
        client.post(f"/api/workspaces/{workspace_id}/projects/{project_id}/archive").status_code
        == 200
    )
    assert client.post(f"{root}/features", json={"title": "Should not write"}).status_code == 422
    assert client.get(f"{root}/features").status_code == 200


def test_dependencies_reject_duplicates_cycles_and_cross_project(
    planning_client: tuple[TestClient, str, str],
) -> None:
    client, project_id, other_project_id = planning_client
    workspace_id = client.get("/api/workspaces").json()[0]["id"]
    root = f"/api/workspaces/{workspace_id}/projects/{project_id}"
    other_root = f"/api/workspaces/{workspace_id}/projects/{other_project_id}"
    first = client.post(f"{root}/features", json={"title": "First"}).json()
    second = client.post(f"{root}/features", json={"title": "Second"}).json()
    third = client.post(f"{root}/features", json={"title": "Third"}).json()
    other = client.post(f"{other_root}/features", json={"title": "Other"}).json()

    edge = {"blocking_feature_id": second["id"], "blocked_feature_id": first["id"]}
    assert client.post(f"{root}/dependencies", json=edge).status_code == 201
    assert client.post(f"{root}/dependencies", json=edge).status_code == 409
    assert client.post(
        f"{root}/dependencies",
        json={"blocking_feature_id": third["id"], "blocked_feature_id": second["id"]},
    ).status_code == 201
    assert client.post(
        f"{root}/dependencies",
        json={"blocking_feature_id": first["id"], "blocked_feature_id": third["id"]},
    ).status_code == 422
    assert client.post(
        f"{root}/dependencies",
        json={"blocking_feature_id": first["id"], "blocked_feature_id": second["id"]},
    ).status_code == 422
    assert client.post(
        f"{root}/dependencies",
        json={"blocking_feature_id": other["id"], "blocked_feature_id": third["id"]},
    ).status_code == 404
