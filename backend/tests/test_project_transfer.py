from __future__ import annotations

import json
from typing import Any

import pytest

from app.api.schemas.project_transfer import ProjectImportDocument
from app.application.project_transfer import (
    ProjectTransferService,
    canonical_import_json,
    import_fingerprint,
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


def test_canonical_fingerprint_is_independent_of_json_key_order() -> None:
    document = ProjectImportDocument.model_validate(valid_document())
    reordered = json.loads(json.dumps(valid_document(), sort_keys=True))
    other = ProjectImportDocument.model_validate(reordered)

    assert canonical_import_json(document) == canonical_import_json(other)
    assert import_fingerprint(document) == import_fingerprint(other)

