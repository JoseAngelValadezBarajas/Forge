from collections.abc import Iterator

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app


def _fixture() -> tuple[TestClient, str, str, str, str, object]:
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    def override_db() -> Iterator[Session]:
        with sessions() as session:
            yield session

    app.dependency_overrides[get_db] = override_db
    client = TestClient(app)
    workspace = client.post("/api/workspaces", json={"name": "FND-05"}).json()
    project = client.post(
        f"/api/workspaces/{workspace['id']}/projects", json={"name": "Runs"}
    ).json()
    feature = client.post(
        f"/api/workspaces/{workspace['id']}/projects/{project['id']}/features",
        json={"title": "Record work", "goal": "Preserve handoff context"},
    ).json()
    package = client.post(
        f"/api/workspaces/{workspace['id']}/projects/{project['id']}/features/{feature['id']}/context/packages"
    ).json()
    return client, workspace["id"], project["id"], feature["id"], package["id"], engine


def _close(fixture: tuple[TestClient, str, str, str, str, object]) -> None:
    client, *_ids, engine = fixture
    client.close()
    app.dependency_overrides.clear()
    engine.dispose()  # type: ignore[attr-defined]


def test_fnd05_tables_exist() -> None:
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    names = set(inspect(engine).get_table_names())
    assert {
        "agent_runs",
        "run_events",
        "run_output_references",
        "handoffs",
        "handoff_revisions",
        "handoff_acknowledgements",
    }.issubset(names)
    engine.dispose()


def test_run_pins_context_and_enforces_status_version() -> None:
    fixture = _fixture()
    client, workspace_id, project_id, feature_id, package_id, _ = fixture
    base = f"/api/workspaces/{workspace_id}/projects/{project_id}"
    created = client.post(
        f"{base}/runs",
        json={
            "feature_id": feature_id,
            "context_package_id": package_id,
            "title": "Reported implementation",
        },
    )
    assert created.status_code == 201
    run = created.json()
    assert run["status"] == "PLANNED"
    assert run["context_package_id"] == package_id
    assert client.get(f"{base}/runs/{run['id']}/events").json()[0]["event_type"] == "status_changed"

    changed = client.post(
        f"{base}/runs/{run['id']}/status",
        json={"status": "IN_PROGRESS", "expected_version": 1},
    )
    assert changed.status_code == 200
    assert changed.json()["version"] == 2
    stale = client.post(
        f"{base}/runs/{run['id']}/status",
        json={"status": "CANCELLED", "expected_version": 1},
    )
    assert stale.status_code == 409
    terminal = client.post(
        f"{base}/runs/{run['id']}/status",
        json={"status": "FAILED", "expected_version": 2},
    )
    assert terminal.status_code == 200
    assert (
        client.post(
            f"{base}/runs/{run['id']}/status",
            json={"status": "IN_PROGRESS", "expected_version": 3},
        ).status_code
        == 422
    )
    _close(fixture)


def test_events_outputs_handoff_revisions_and_acknowledgement() -> None:
    fixture = _fixture()
    client, workspace_id, project_id, feature_id, package_id, _ = fixture
    base = f"/api/workspaces/{workspace_id}/projects/{project_id}"
    run = client.post(
        f"{base}/runs",
        json={
            "feature_id": feature_id,
            "context_package_id": package_id,
            "title": "<reported> work",
        },
    ).json()
    event = client.post(
        f"{base}/runs/{run['id']}/events",
        json={
            "event_type": "progress",
            "title": "Progress",
            "description": "A human recorded progress.",
            "expected_version": 1,
        },
    )
    assert event.status_code == 201
    output = client.post(
        f"{base}/runs/{run['id']}/outputs",
        json={
            "label": "Schema note",
            "summary": "A reported output",
            "provenance": "Manual report",
            "expected_version": 2,
        },
    )
    assert output.status_code == 201
    handoff = client.post(
        f"{base}/runs/{run['id']}/handoffs",
        json={
            "title": "<script>handoff</script>",
            "summary": "Next person needs the context.",
            "outcomes": "Reported outcome",
            "blockers": "None reported",
            "next_actions": "Review manually",
        },
    )
    assert handoff.status_code == 201
    item = handoff.json()
    assert item["status"] == "DRAFT"
    item = client.patch(
        f"{base}/handoffs/{item['id']}",
        json={"expected_version": item["version"], "summary": "Updated summary"},
    ).json()
    ready = client.post(
        f"{base}/handoffs/{item['id']}/ready", json={"expected_version": item["version"]}
    )
    assert ready.status_code == 200
    published = ready.json()
    assert published["current_revision"] == 1
    assert published["published_revision"]["payload"]["schema"] == "forge-handoff-v1"
    assert "&lt;script&gt;" in published["published_revision"]["markdown"]
    acknowledgement = client.post(
        f"{base}/handoffs/{item['id']}/acknowledge",
        json={"expected_revision": 1, "acknowledged_by": "reviewer"},
    )
    assert acknowledgement.status_code == 200
    acknowledged = client.get(f"{base}/handoffs/{item['id']}").json()
    revised = client.post(
        f"{base}/handoffs/{item['id']}/revise",
        json={"expected_version": acknowledged["version"]},
    )
    assert revised.status_code == 200
    ready_again = client.post(
        f"{base}/handoffs/{item['id']}/ready",
        json={"expected_version": revised.json()["version"]},
    )
    assert ready_again.status_code == 200
    assert ready_again.json()["current_revision"] == 2
    assert (
        client.post(
            f"{base}/handoffs/{item['id']}/acknowledge", json={"expected_revision": 1}
        ).status_code
        == 409
    )
    assert client.get(f"{base}/handoffs/{item['id']}/revisions").json()[0]["revision"] == 2
    _close(fixture)


def test_workspace_isolation_and_archived_mutation_boundary() -> None:
    fixture = _fixture()
    client, workspace_id, project_id, feature_id, package_id, _ = fixture
    other_workspace = client.post("/api/workspaces", json={"name": "Other FND-05"}).json()
    base = f"/api/workspaces/{workspace_id}/projects/{project_id}"
    run = client.post(
        f"{base}/runs",
        json={"feature_id": feature_id, "context_package_id": package_id, "title": "Read"},
    ).json()
    assert (
        client.get(
            f"/api/workspaces/{other_workspace['id']}/projects/{project_id}/runs/{run['id']}"
        ).status_code
        == 404
    )
    assert client.post(f"{base}/archive").status_code == 200
    assert client.get(f"{base}/runs/{run['id']}").status_code == 200
    assert (
        client.post(
            f"{base}/runs/{run['id']}/status",
            json={"status": "IN_PROGRESS", "expected_version": 1},
        ).status_code
        == 422
    )
    assert (
        client.post(
            f"{base}/runs/{run['id']}/handoffs", json={"title": "Not writable"}
        ).status_code
        == 422
    )
    _close(fixture)


def test_missing_or_cross_feature_context_is_rejected() -> None:
    fixture = _fixture()
    client, workspace_id, project_id, feature_id, _package_id, _ = fixture
    base = f"/api/workspaces/{workspace_id}/projects/{project_id}"
    missing = client.post(
        f"{base}/runs",
        json={"feature_id": feature_id, "context_package_id": "missing", "title": "No context"},
    )
    assert missing.status_code == 422
    assert client.get(f"/api/workspaces/{workspace_id}/runs?status=UNKNOWN").status_code == 422
    _close(fixture)
