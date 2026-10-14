from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app


@pytest.fixture
def fnd03_client() -> Iterator[tuple[TestClient, str, str, str]]:
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
        workspace = client.post("/api/workspaces", json={"name": "FND-03"}).json()
        project = client.post(
            f"/api/workspaces/{workspace['id']}/projects", json={"name": "Forge"}
        ).json()
        feature = client.post(
            f"/api/workspaces/{workspace['id']}/projects/{project['id']}/features",
            json={"title": "Readiness", "goal": "Decide whether planning can start"},
        ).json()
        yield client, workspace["id"], project["id"], feature["id"]
    app.dependency_overrides.clear()
    engine.dispose()


def root(ids: tuple[TestClient, str, str, str]) -> tuple[TestClient, str, str, str]:
    client, workspace_id, project_id, feature_id = ids
    return client, f"/api/workspaces/{workspace_id}/projects/{project_id}", project_id, feature_id


def test_fnd03_migration_adds_decision_invariant_and_evaluation_tables() -> None:
    assert {
        "decisions",
        "decision_revisions",
        "decision_feature_links",
        "invariants",
        "invariant_revisions",
        "invariant_acknowledgements",
        "readiness_evaluations",
    }.issubset(set(Base.metadata.tables))
    assert inspect(Base.metadata) is not None


def test_readiness_preview_save_stale_and_history(
    fnd03_client: tuple[TestClient, str, str, str],
) -> None:
    client, path, _project_id, feature_id = root(fnd03_client)
    preview = client.post(f"{path}/features/{feature_id}/readiness/preview")
    assert preview.status_code == 200
    assert preview.json()["outcome"] == "NOT_READY"
    assert {item["rule_id"] for item in preview.json()["results"]} == {
        "R01", "R02", "R03", "R04", "R05", "R06"
    }
    assert "R02" in preview.json()["failed_checks"]

    criterion = client.post(
        f"{path}/features/{feature_id}/acceptance-criteria",
        json={"description": "The readiness explanation is explicit"},
    )
    assert criterion.status_code == 201
    decision = client.post(
        f"{path}/decisions",
        json={
            "title": "Use deterministic rules",
            "context": "Forge needs a repeatable planning gate",
            "decision": "Use versioned local rules",
            "rationale": "The result must be explainable",
        },
    )
    assert decision.status_code == 201
    decision_id = decision.json()["id"]
    assert client.post(f"{path}/decisions/{decision_id}/features/{feature_id}").status_code == 204
    invariant = client.post(
        f"{path}/invariants",
        json={
            "title": "No technical verification claims",
            "statement": "Planning readiness never means delivery verified",
            "rationale": "Reported, observed and verified remain separate",
        },
    )
    assert invariant.status_code == 201
    invariant_id = invariant.json()["id"]

    blocked = client.post(f"{path}/features/{feature_id}/readiness/preview").json()
    assert blocked["outcome"] == "NOT_READY"
    assert {item["rule_id"] for item in blocked["results"] if item["result"] == "failed"} == {
        "R04", "R05"
    }
    accepted = client.post(f"{path}/decisions/{decision_id}/accept")
    assert accepted.status_code == 200
    acknowledged = client.post(
        f"{path}/features/{feature_id}/invariants/{invariant_id}/acknowledge"
    )
    assert acknowledged.status_code == 200

    ready = client.post(f"{path}/features/{feature_id}/readiness/preview").json()
    assert ready["outcome"] == "READY_TO_START"
    assert ready["blockers"] == []
    saved = client.post(f"{path}/features/{feature_id}/readiness/evaluations")
    assert saved.status_code == 201
    assert saved.json()["stale"] is False
    evaluation_id = saved.json()["evaluation_id"]

    changed = client.patch(
        f"{path}/invariants/{invariant_id}",
        json={"statement": "Planning readiness never means technical verification"},
    )
    assert changed.status_code == 200
    history = client.get(f"{path}/features/{feature_id}/readiness/evaluations")
    assert history.status_code == 200
    assert len(history.json()) == 1
    assert history.json()[0]["evaluation_id"] == evaluation_id
    assert history.json()[0]["stale"] is True


def test_decision_revisions_supersession_and_cross_project_isolation(
    fnd03_client: tuple[TestClient, str, str, str],
) -> None:
    client, path, _project_id, feature_id = root(fnd03_client)
    decision = client.post(
        f"{path}/decisions",
        json={
            "title": "Initial decision",
            "context": "Context",
            "decision": "Initial",
            "rationale": "Reason",
        },
    ).json()
    updated = client.patch(
        f"{path}/decisions/{decision['id']}",
        json={"rationale": "Updated reason"},
    )
    assert updated.status_code == 200
    assert updated.json()["revision"] == 2
    revisions = client.get(f"{path}/decisions/{decision['id']}/revisions").json()
    assert [item["revision"] for item in revisions] == [2, 1]
    successor = client.post(
        f"{path}/decisions/{decision['id']}/supersede",
        json={
            "title": "Successor decision",
            "context": "New context",
            "decision": "New decision",
            "rationale": "New reason",
        },
    )
    assert successor.status_code == 201
    old = client.get(f"{path}/decisions/{decision['id']}").json()
    assert old["status"] == "superseded"
    assert old["superseded_by_id"] == successor.json()["id"]
    assert (
        client.post(f"{path}/decisions/{decision['id']}/features/{feature_id}").status_code
        == 422
    )


def test_invariant_revision_invalidates_acknowledgement(
    fnd03_client: tuple[TestClient, str, str, str],
) -> None:
    client, path, _project_id, feature_id = root(fnd03_client)
    invariant = client.post(
        f"{path}/invariants",
        json={"title": "Invariant", "statement": "Keep it true", "rationale": "Important"},
    ).json()
    ack = client.post(
        f"{path}/features/{feature_id}/invariants/{invariant['id']}/acknowledge"
    )
    assert ack.json()["acknowledged_revision"] == 1
    changed = client.patch(
        f"{path}/invariants/{invariant['id']}", json={"rationale": "Changed context"}
    ).json()
    assert changed["revision"] == 2
    applicable = client.get(f"{path}/features/{feature_id}/invariants").json()
    assert applicable[0]["needs_acknowledgement"] is True
