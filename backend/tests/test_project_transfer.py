from __future__ import annotations

import json
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from pathlib import Path
from threading import Barrier
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.schemas.project_transfer import ProjectImportDocument
from app.application.common.errors import DuplicateName
from app.application.project_transfer import (
    ProjectTransferService,
    canonical_import_json,
    import_fingerprint,
)
from app.config import Settings
from app.db import Base, get_db
from app.main import create_app
from app.persistence.models import (
    AcceptanceCriterionModel,
    EpicModel,
    FeatureDependencyModel,
    FeatureModel,
    ProjectModel,
    TaskModel,
)


def valid_document() -> dict[str, Any]:
    return {
        "schema_version": "forge-project-import-v1",
        "project": {"name": "Imported planning"},
        "epics": [
            {
                "ref": "epic:foundation",
                "title": "Foundation",
                "description": None,
                "status": "planning",
            }
        ],
        "features": [
            {
                "ref": "feature:bootstrap",
                "title": "Bootstrap",
                "description": None,
                "goal": "Start Forge",
                "priority": "high",
                "status": "backlog",
                "epic_ref": "epic:foundation",
                "tasks": [
                    {"ref": "task:one", "title": "First task"},
                    {"ref": "task:two", "title": "Second task", "position": 7},
                ],
                "acceptance_criteria": [
                    {"ref": "criterion:one", "description": "It starts"},
                ],
            }
        ],
        "dependencies": [],
    }


def test_checked_in_schema_and_examples_match_the_runtime_contract() -> None:
    repository_root = Path(__file__).parents[2]
    schema = json.loads(
        (repository_root / "docs/product/schemas/forge-project-import-v1.schema.json").read_text()
    )
    valid = json.loads(
        (repository_root / "docs/product/examples/forge-project-import-v1.valid.json").read_text()
    )
    invalid = json.loads(
        (repository_root / "docs/product/examples/forge-project-import-v1.invalid.json").read_text()
    )

    assert schema["properties"]["schema_version"]["const"] == "forge-project-import-v1"
    ProjectImportDocument.model_validate(valid)
    with pytest.raises(ValueError):
        ProjectImportDocument.model_validate(invalid)


@pytest.fixture
def transfer_client() -> Iterator[tuple[TestClient, sessionmaker[Session]]]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    application = create_app(Settings(database_url="sqlite:///:memory:"))

    def override_db() -> Iterator[Session]:
        session = sessions()
        try:
            yield session
        finally:
            session.close()

    application.dependency_overrides[get_db] = override_db
    with TestClient(application) as client:
        yield client, sessions
    engine.dispose()


def create_workspace(client: TestClient, name: str = "Import workspace") -> str:
    response = client.post("/api/workspaces", json={"name": name})
    assert response.status_code == 201
    workspace_id = response.json()["id"]
    assert isinstance(workspace_id, str)
    return workspace_id


def test_contract_rejects_unknown_fields_and_unsupported_statuses() -> None:
    payload = valid_document()
    payload["unexpected"] = True
    with pytest.raises(ValueError):
        ProjectImportDocument.model_validate(payload)

    unsupported = valid_document()
    feature = unsupported["features"][0]
    feature["status"] = "implemented"
    with pytest.raises(ValueError):
        ProjectImportDocument.model_validate(unsupported)

    cross_type_ref = valid_document()
    cross_type_ref["features"][0]["ref"] = "task:not-a-feature"
    with pytest.raises(ValueError):
        ProjectImportDocument.model_validate(cross_type_ref)


def test_contract_defaults_and_normalizes_declared_positions() -> None:
    document = ProjectImportDocument.model_validate(valid_document())
    normalized = ProjectTransferService.normalize(document)

    feature = normalized.features[0]
    assert feature.priority == "high"
    assert feature.status == "backlog"
    assert [task.status for task in feature.tasks] == ["todo", "todo"]
    assert [task.position for task in feature.tasks] == [0, 1]
    assert [criterion.satisfied for criterion in feature.acceptance_criteria] == [False]
    assert [criterion.position for criterion in feature.acceptance_criteria] == [0]


@pytest.mark.parametrize(
    ("field", "message"),
    [
        ("duplicate_epic_ref", "duplicate local reference"),
        ("missing_epic_ref", "Epic reference not found"),
        ("missing_dependency_ref", "Feature reference not found"),
        ("dependency_cycle", "dependency cycle"),
    ],
)
def test_reference_validation_rejects_invalid_graph(field: str, message: str) -> None:
    payload = valid_document()
    if field == "duplicate_epic_ref":
        payload["epics"] = [payload["epics"][0], payload["epics"][0]]
    elif field == "missing_epic_ref":
        payload["features"][0]["epic_ref"] = "epic:missing"
    elif field == "missing_dependency_ref":
        payload["dependencies"] = [
            {"blocking_feature_ref": "feature:missing", "blocked_feature_ref": "feature:bootstrap"}
        ]
    else:
        payload["features"].append(
            {
                "ref": "feature:delivery",
                "title": "Delivery",
                "tasks": [],
                "acceptance_criteria": [],
            }
        )
        payload["dependencies"] = [
            {
                "blocking_feature_ref": "feature:bootstrap",
                "blocked_feature_ref": "feature:delivery",
            },
            {
                "blocking_feature_ref": "feature:delivery",
                "blocked_feature_ref": "feature:bootstrap",
            },
        ]

    document = ProjectImportDocument.model_validate(payload)
    with pytest.raises(ValueError, match=message):
        ProjectTransferService.validate(document)


@pytest.mark.parametrize("collection", ["tasks", "acceptance_criteria"])
def test_preview_rejects_global_child_limits_across_multiple_features(
    transfer_client: tuple[TestClient, sessionmaker[Session]], collection: str
) -> None:
    client, sessions = transfer_client
    workspace_id = create_workspace(client, f"Global {collection} limit workspace")
    base_feature = valid_document()["features"][0]
    features: list[dict[str, Any]] = []
    for feature_index in range(2):
        feature = deepcopy(base_feature)
        feature["ref"] = f"feature:limit-{feature_index}"
        feature["title"] = f"Limit feature {feature_index}"
        feature["epic_ref"] = None
        feature["tasks"] = []
        feature["acceptance_criteria"] = []
        if collection == "tasks":
            feature["tasks"] = [
                {"ref": f"task:limit-{feature_index}-{item}", "title": f"Task {item}"}
                for item in range(1001)
            ]
        else:
            feature["acceptance_criteria"] = [
                {
                    "ref": f"criterion:limit-{feature_index}-{item}",
                    "description": f"Criterion {item}",
                }
                for item in range(1001)
            ]
        features.append(feature)
    payload = valid_document()
    payload["features"] = features

    response = client.post(
        f"/api/workspaces/{workspace_id}/projects/import/preview", json=payload
    )

    assert response.status_code == 422
    assert "maximum of 2000" in response.json()["detail"]
    with sessions() as session:
        assert session.scalar(select(func.count()).select_from(ProjectModel)) == 0
        assert session.scalar(select(func.count()).select_from(TaskModel)) == 0
        assert session.scalar(select(func.count()).select_from(AcceptanceCriterionModel)) == 0


def test_duplicate_dependency_edges_are_rejected_before_import_writes(
    transfer_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, sessions = transfer_client
    workspace_id = create_workspace(client, "Duplicate dependency workspace")
    payload = valid_document()
    payload["features"].append(
        {
            "ref": "feature:delivery",
            "title": "Delivery",
            "tasks": [],
            "acceptance_criteria": [],
        }
    )
    payload["dependencies"] = [
        {
            "blocking_feature_ref": "feature:bootstrap",
            "blocked_feature_ref": "feature:delivery",
        },
        {
            "blocking_feature_ref": "feature:bootstrap",
            "blocked_feature_ref": "feature:delivery",
        },
    ]

    response = client.post(
        f"/api/workspaces/{workspace_id}/projects/import",
        json={"document": payload, "expected_fingerprint": "0" * 64},
    )

    assert response.status_code == 422
    assert "duplicate dependency edge" in response.json()["detail"].lower()
    with sessions() as session:
        assert session.scalar(select(func.count()).select_from(ProjectModel)) == 0
        assert session.scalar(select(func.count()).select_from(EpicModel)) == 0
        assert session.scalar(select(func.count()).select_from(FeatureModel)) == 0
        assert session.scalar(select(func.count()).select_from(FeatureDependencyModel)) == 0


def test_canonical_fingerprint_is_independent_of_json_key_order() -> None:
    document = ProjectImportDocument.model_validate(valid_document())
    reordered = json.loads(json.dumps(valid_document(), sort_keys=True))
    other = ProjectImportDocument.model_validate(reordered)

    assert canonical_import_json(document) == canonical_import_json(other)
    assert import_fingerprint(document) == import_fingerprint(other)


def test_preview_is_read_only_and_commit_imports_the_full_hierarchy(
    transfer_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, sessions = transfer_client
    workspace_id = create_workspace(client)
    payload = valid_document()

    preview = client.post(
        f"/api/workspaces/{workspace_id}/projects/import/preview", json=payload
    )
    assert preview.status_code == 200
    preview_body = preview.json()
    assert preview_body["project_name_conflict"] is False
    assert preview_body["counts"] == {
        "epics": 1,
        "features": 1,
        "tasks": 2,
        "acceptance_criteria": 1,
        "dependencies": 0,
    }
    with sessions() as session:
        assert session.scalar(select(func.count()).select_from(ProjectModel)) == 0

    committed = client.post(
        f"/api/workspaces/{workspace_id}/projects/import",
        json={
            "document": preview_body["document"],
            "expected_fingerprint": preview_body["fingerprint"],
        },
    )
    assert committed.status_code == 201, committed.text
    result = committed.json()
    assert result["project_id"]
    assert len(result["references"]) == 5
    project_id = result["project_id"]
    assert client.get(f"/api/workspaces/{workspace_id}/projects/{project_id}").status_code == 200
    assert (
        len(client.get(f"/api/workspaces/{workspace_id}/projects/{project_id}/epics").json())
        == 1
    )
    features = client.get(
        f"/api/workspaces/{workspace_id}/projects/{project_id}/features"
    ).json()
    assert len(features) == 1
    feature_id = features[0]["id"]
    assert len(
        client.get(
            f"/api/workspaces/{workspace_id}/projects/{project_id}/features/{feature_id}/tasks"
        ).json()
    ) == 2
    assert len(
        client.get(
            f"/api/workspaces/{workspace_id}/projects/{project_id}/features/{feature_id}/acceptance-criteria"
        ).json()
    ) == 1


def test_import_body_limit_rejects_oversized_and_malformed_content_length(
    transfer_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, _ = transfer_client
    workspace_id = create_workspace(client, "Payload limit workspace")
    endpoint = f"/api/workspaces/{workspace_id}/projects/import/preview"

    oversized = client.post(
        endpoint,
        content=b"{}",
        headers={"content-type": "application/json", "content-length": str(8 * 1024 * 1024 + 1)},
    )
    malformed = client.post(
        endpoint,
        content=b"{}",
        headers={"content-type": "application/json", "content-length": "not-a-length"},
    )

    assert oversized.status_code == 413
    assert malformed.status_code == 400


def test_confirmation_rejects_changed_document_before_any_write(
    transfer_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, sessions = transfer_client
    workspace_id = create_workspace(client)
    preview = client.post(
        f"/api/workspaces/{workspace_id}/projects/import/preview", json=valid_document()
    ).json()
    changed = dict(preview["document"])
    changed["project"] = {"name": "Changed after preview"}

    response = client.post(
        f"/api/workspaces/{workspace_id}/projects/import",
        json={"document": changed, "expected_fingerprint": preview["fingerprint"]},
    )

    assert response.status_code == 409
    assert "preview" in response.json()["detail"].lower()
    with sessions() as session:
        assert session.scalar(select(func.count()).select_from(ProjectModel)) == 0


def test_repeated_import_and_foreign_project_export_are_rejected(
    transfer_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, _sessions = transfer_client
    workspace_id = create_workspace(client)
    other_workspace_id = create_workspace(client, "Other workspace")
    payload = valid_document()
    preview = client.post(
        f"/api/workspaces/{workspace_id}/projects/import/preview", json=payload
    ).json()
    request = {
        "document": preview["document"],
        "expected_fingerprint": preview["fingerprint"],
    }
    first = client.post(f"/api/workspaces/{workspace_id}/projects/import", json=request)
    assert first.status_code == 201
    project_id = first.json()["project_id"]
    second = client.post(f"/api/workspaces/{workspace_id}/projects/import", json=request)
    assert second.status_code == 409
    assert client.get(
        f"/api/workspaces/{other_workspace_id}/projects/{project_id}/export"
    ).status_code == 404


def test_archived_project_can_be_exported_as_a_planning_snapshot(
    transfer_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, _sessions = transfer_client
    workspace_id = create_workspace(client)
    preview = client.post(
        f"/api/workspaces/{workspace_id}/projects/import/preview", json=valid_document()
    ).json()
    imported = client.post(
        f"/api/workspaces/{workspace_id}/projects/import",
        json={"document": preview["document"], "expected_fingerprint": preview["fingerprint"]},
    ).json()
    project_id = imported["project_id"]
    assert (
        client.post(f"/api/workspaces/{workspace_id}/projects/{project_id}/archive").status_code
        == 200
    )

    exported = client.get(
        f"/api/workspaces/{workspace_id}/projects/{project_id}/export"
    )
    assert exported.status_code == 200
    assert exported.headers["content-type"].startswith("application/json")
    assert exported.json()["schema_version"] == "forge-project-import-v1"


def test_import_rolls_back_all_rows_when_persistence_fails(
    transfer_client: tuple[TestClient, sessionmaker[Session]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _client, sessions = transfer_client
    with sessions() as session:
        from app.persistence.models import WorkspaceModel

        workspace = WorkspaceModel(name="Rollback workspace")
        session.add(workspace)
        session.commit()
        workspace_id = workspace.id

    document = ProjectImportDocument.model_validate(valid_document())
    service = ProjectTransferService(sessions())
    session = service.session
    flush_count = 0
    original_flush = session.flush

    def fail_on_feature_flush(*args: Any, **kwargs: Any) -> None:
        nonlocal flush_count
        flush_count += 1
        if flush_count == 3:
            raise RuntimeError("simulated persistence failure")
        original_flush(*args, **kwargs)

    monkeypatch.setattr(session, "flush", fail_on_feature_flush)
    with pytest.raises(RuntimeError, match="simulated persistence failure"):
        service.import_project(workspace_id, document, import_fingerprint(document))
    session.close()

    with sessions() as check:
        assert check.scalar(select(func.count()).select_from(ProjectModel)) == 0
        assert check.scalar(select(func.count()).select_from(EpicModel)) == 0
        assert check.scalar(select(func.count()).select_from(FeatureModel)) == 0
        assert check.scalar(select(func.count()).select_from(TaskModel)) == 0
        assert check.scalar(select(func.count()).select_from(AcceptanceCriterionModel)) == 0
        assert check.scalar(select(func.count()).select_from(FeatureDependencyModel)) == 0


def test_export_import_round_trip_preserves_supported_planning_structure(
    transfer_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, _sessions = transfer_client
    source_workspace = create_workspace(client, "Source workspace")
    target_workspace = create_workspace(client, "Target workspace")
    payload = valid_document()
    payload["features"].append(
        {
            "ref": "feature:delivery",
            "title": "Delivery",
            "goal": "Keep the plan portable",
            "tasks": [{"ref": "task:delivery", "title": "Review export"}],
            "acceptance_criteria": [],
        }
    )
    payload["dependencies"] = [
        {
            "blocking_feature_ref": "feature:bootstrap",
            "blocked_feature_ref": "feature:delivery",
        }
    ]
    preview = client.post(
        f"/api/workspaces/{source_workspace}/projects/import/preview", json=payload
    ).json()
    imported = client.post(
        f"/api/workspaces/{source_workspace}/projects/import",
        json={"document": preview["document"], "expected_fingerprint": preview["fingerprint"]},
    )
    assert imported.status_code == 201, imported.text
    source_project_id = imported.json()["project_id"]

    exported = client.get(
        f"/api/workspaces/{source_workspace}/projects/{source_project_id}/export"
    )
    assert exported.status_code == 200
    exported_document = exported.json()
    target_preview = client.post(
        f"/api/workspaces/{target_workspace}/projects/import/preview", json=exported_document
    ).json()
    target_import = client.post(
        f"/api/workspaces/{target_workspace}/projects/import",
        json={
            "document": target_preview["document"],
            "expected_fingerprint": target_preview["fingerprint"],
        },
    )
    assert target_import.status_code == 201, target_import.text
    assert target_import.json()["counts"] == {
        "epics": 1,
        "features": 2,
        "tasks": 3,
        "acceptance_criteria": 1,
        "dependencies": 1,
    }


def test_concurrent_same_name_imports_have_one_winner(tmp_path: Any) -> None:
    database = tmp_path / "concurrent-import.db"
    engine = create_engine(
        f"sqlite:///{database.as_posix()}",
        connect_args={"check_same_thread": False, "timeout": 30},
    )
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    with sessions() as session:
        from app.persistence.models import WorkspaceModel

        workspace = WorkspaceModel(name="Concurrent workspace")
        session.add(workspace)
        session.commit()
        workspace_id = workspace.id

    document = ProjectImportDocument.model_validate(valid_document())
    barrier = Barrier(2)

    def attempt() -> str:
        session = sessions()
        try:
            barrier.wait()
            ProjectTransferService(session).import_project(
                workspace_id, document, import_fingerprint(document)
            )
            return "created"
        except DuplicateName:
            return "duplicate"
        except OperationalError as exc:
            pytest.fail(f"concurrent import was not translated to a conflict: {exc}")
        finally:
            session.close()

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _index: attempt(), range(2)))
    engine.dispose()

    assert sorted(results) == ["created", "duplicate"]

