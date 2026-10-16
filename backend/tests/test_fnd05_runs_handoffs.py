from collections.abc import Iterator
from typing import cast

from fastapi.testclient import TestClient
from httpx import Response
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
    assert {"published_revision", "acknowledgement", "acknowledgements"}.issubset(item)
    assert item["published_revision"] is None
    assert item["acknowledgement"] is None
    assert item["acknowledgements"] == []
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
    payload = published["published_revision"]["payload"]
    assert payload["project_id"] == project_id
    assert payload["feature_id"] == feature_id
    assert payload["source_context"]["schema_version"] == "forge-context-v1"
    assert payload["provenance"] == {
        "origin": "manual",
        "observed": False,
        "reported": True,
        "verified": False,
    }
    assert "project_id:" in published["published_revision"]["markdown"]
    assert "source_context.schema_version:" in published["published_revision"]["markdown"]
    assert "provenance.verified: False" in published["published_revision"]["markdown"]
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
    current = client.get(f"{base}/handoffs/{item['id']}").json()
    assert current["acknowledgement"] is None
    assert [ack["revision"] for ack in current["acknowledgements"]] == [1]
    assert (
        client.post(
            f"{base}/handoffs/{item['id']}/acknowledge", json={"expected_revision": 1}
        ).status_code
        == 409
    )
    assert client.get(f"{base}/handoffs/{item['id']}/revisions").json()[0]["revision"] == 2
    _close(fixture)


def test_handoff_ready_rejects_an_empty_or_whitespace_report() -> None:
    fixture = _fixture()
    client, workspace_id, project_id, feature_id, package_id, _ = fixture
    base = f"/api/workspaces/{workspace_id}/projects/{project_id}"
    run = client.post(
        f"{base}/runs",
        json={"feature_id": feature_id, "context_package_id": package_id, "title": "Empty report"},
    ).json()
    handoff = client.post(
        f"{base}/runs/{run['id']}/handoffs", json={"title": "Needs content"}
    ).json()
    ready = client.post(
        f"{base}/handoffs/{handoff['id']}/ready",
        json={"expected_version": handoff["version"]},
    )
    assert ready.status_code == 422
    assert "summary" in ready.json()["detail"]
    assert "next_actions" in ready.json()["detail"]

    updated = client.patch(
        f"{base}/handoffs/{handoff['id']}",
        json={
            "expected_version": handoff["version"],
            "summary": "   ",
            "next_actions": "\t",
        },
    )
    assert updated.status_code == 200
    ready_whitespace = client.post(
        f"{base}/handoffs/{handoff['id']}/ready",
        json={"expected_version": updated.json()["version"]},
    )
    assert ready_whitespace.status_code == 422
    assert "summary" in ready_whitespace.json()["detail"]
    assert "next_actions" in ready_whitespace.json()["detail"]
    _close(fixture)


def test_output_references_are_kind_specific_and_never_resolved() -> None:
    fixture = _fixture()
    client, workspace_id, project_id, feature_id, package_id, _ = fixture
    base = f"/api/workspaces/{workspace_id}/projects/{project_id}"
    run = client.post(
        f"{base}/runs",
        json={"feature_id": feature_id, "context_package_id": package_id, "title": "References"},
    ).json()

    def add(value: str | None, kind: str, expected_version: int) -> Response:
        return cast(
            Response,
            client.post(
                f"{base}/runs/{run['id']}/outputs",
                json={
                    "label": "Declared reference",
                    "summary": "A human-declared output",
                    "reference_kind": kind,
                    "reference_value": value,
                    "provenance": "Manual report",
                    "expected_version": expected_version,
                },
            ),
        )

    for kind, value in (
        ("safe_link", "file://C:/secret.txt"),
        ("safe_link", "javascript:alert(1)"),
        ("safe_link", "https://user:password@example.test/report"),
        ("safe_link", r"C:\secret.txt"),
        ("safe_link", "/etc/passwd"),
        ("commit", "not-a-commit"),
        ("artifact", "artifacts/output.json"),
        ("artifact", r"C:\artifacts\output.json"),
        ("label", "file://declared"),
    ):
        assert add(value, kind, 1).status_code == 422

    safe_link = add("https://example.test/report", "safe_link", 1)
    assert safe_link.status_code == 201
    assert safe_link.json()["reference_value"] == "https://example.test/report"
    commit = add("a" * 40, "commit", 2)
    assert commit.status_code == 201
    artifact = add("artifact-2026-01", "artifact", 3)
    assert artifact.status_code == 201
    assert artifact.json()["reference_kind"] == "artifact"
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
