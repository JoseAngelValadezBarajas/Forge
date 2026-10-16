from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path
from typing import Any

import pytest
from fastapi.routing import APIRoute
from pydantic import ValidationError
from starlette.routing import Match

from app.api.routes import router
from app.api.schemas import (
    ApplicableInvariantResponse,
    CandidateCreate,
    CandidateUpdate,
    FeatureResponse,
    InvariantResponse,
    VerificationResponse,
    WorkspaceCreate,
)
from app.api.schemas.delivery import CandidateCreate as CanonicalCandidateCreate
from app.api.schemas.delivery import CandidateUpdate as CanonicalCandidateUpdate
from app.api.schemas.delivery import VerificationResponse as CanonicalVerificationResponse
from app.api.schemas.invariants import (
    ApplicableInvariantResponse as CanonicalApplicableInvariantResponse,
)
from app.api.schemas.invariants import InvariantResponse as CanonicalInvariantResponse
from app.api.schemas.planning import FeatureResponse as CanonicalFeatureResponse
from app.api.schemas.workspaces import WorkspaceCreate as CanonicalWorkspaceCreate
from app.main import app

FIXTURES = Path(__file__).parent / "fixtures"


def _callable_name(value: Any) -> str | None:
    if value is None:
        return None
    module = getattr(value, "__module__", type(value).__module__)
    name = getattr(value, "__qualname__", type(value).__qualname__)
    return f"{module}.{name}"


def _dependency_records(items: list[Any]) -> list[dict[str, Any]]:
    return [
        {
            "call": _callable_name(item.call),
            "use_cache": item.use_cache,
            "scope": item.scope,
            "dependencies": _dependency_records(item.dependencies),
        }
        for item in items
    ]


def _effective_routes(items: list[Any]) -> list[Any]:
    result: list[Any] = []
    for item in items:
        if isinstance(item, APIRoute):
            result.append(item)
            continue
        if isinstance(getattr(item, "original_route", None), APIRoute):
            result.append(item)
            continue
        candidates = getattr(item, "_effective_candidates", None)
        if candidates is not None:
            result.extend(_effective_routes(list(candidates)))
            continue
        nested_route = getattr(item, "route", None)
        if nested_route is not None:
            result.extend(_effective_routes([nested_route]))
            continue
        original_router = getattr(item, "original_router", None)
        if original_router is not None:
            result.extend(_effective_routes(original_router.routes))
    return result


def _route_records(routes: list[Any]) -> list[dict[str, Any]]:
    return [
        {
            "index": index,
            "path": route.path,
            "methods": sorted(route.methods or []),
            "endpoint_name": route.endpoint.__name__,
            "endpoint_module": route.endpoint.__module__,
            "route_name": route.name,
            "status_code": route.status_code,
            "response_model": _callable_name(route.response_model),
            "dependencies": _dependency_records(route.dependant.dependencies),
            "body_parameters": [item.name for item in route.dependant.body_params],
        }
        for index, route in enumerate(routes)
    ]


def _normalize_schema_module(record: dict[str, Any]) -> dict[str, Any]:
    # Model module paths move by design; the frozen OpenAPI comparison checks the
    # externally visible component names, fields, constraints and serialization.
    normalized = dict(record)
    model = normalized["response_model"]
    if isinstance(model, str) and model.startswith("app.api.schemas."):
        normalized["response_model"] = model.rsplit(".", maxsplit=1)[-1]
    return normalized


OPENAPI = app.openapi()
ROUTES = _effective_routes(router.routes)


def _apply_rfx_org_03a_openapi_delta(expected: dict[str, Any]) -> dict[str, Any]:
    corrected = deepcopy(expected)
    delta = json.loads(
        (FIXTURES / "rfx-org-03a-openapi-delta.json").read_text(encoding="utf-8")
    )
    schemas = corrected["components"]["schemas"]
    for name, fields in delta["required_additions"].items():
        schemas[name]["required"] = [*schemas[name].get("required", []), *fields]
    for name, fields in delta["required_order_overrides"].items():
        schemas[name]["required"] = fields
    for name, fields in delta["remove_defaults"].items():
        for field in fields:
            schemas[name]["properties"][field].pop("default")
    for name, properties in delta["property_replacements"].items():
        schemas[name]["properties"].update(properties)
    schemas.update(delta["components"])
    for route, schema in delta["response_schema_replacements"].items():
        path, method, status_code = route.rsplit("#", maxsplit=2)
        corrected["paths"][path][method]["responses"][status_code]["content"][
            "application/json"
        ]["schema"] = schema
    return corrected


def test_complete_openapi_matches_frozen_baseline_plus_rfx_org_03a_corrections() -> None:
    expected = json.loads((FIXTURES / "rfx01b-openapi-baseline.json").read_text(encoding="utf-8"))

    assert OPENAPI == _apply_rfx_org_03a_openapi_delta(expected)


def test_runtime_route_registry_preserves_all_105_registrations() -> None:
    expected = json.loads(
        (FIXTURES / "rfx01b-route-registry-baseline.json").read_text(encoding="utf-8")
    )
    actual = _route_records(ROUTES)
    # Endpoint modules also change by design; function names and all route metadata
    # remain compared, while module ownership is asserted to be a router package.
    comparable_expected = [
        _normalize_schema_module(
            {key: value for key, value in route.items() if key != "endpoint_module"}
        )
        for route in expected
    ]
    comparable_actual = [
        _normalize_schema_module(
            {key: value for key, value in route.items() if key != "endpoint_module"}
        )
        for route in actual
    ]
    method_paths = [
        (method, route.path) for route in ROUTES for method in route.methods or []
    ]

    assert len(ROUTES) == 105
    assert len(method_paths) == 105
    assert len(set(method_paths)) == len(method_paths)
    assert all(route.endpoint.__module__.startswith("app.api.routers.") for route in ROUTES)
    assert comparable_actual == comparable_expected


def _first_matching_route(path: str, method: str) -> Any:
    scope = {
        "type": "http",
        "path": path,
        "root_path": "",
        "method": method,
        "headers": [],
    }
    for route in ROUTES:
        match, _ = route.matches(scope)
        if match is Match.FULL:
            return route
    raise AssertionError(f"No route matches {method} {path}")


def test_static_and_reorder_routes_resolve_to_the_original_handlers() -> None:
    base = "/api/workspaces/ws/projects/project"

    assert (
        _first_matching_route(f"{base}/verifications/rules", "GET").endpoint.__name__
        == "list_verification_rules"
    )
    assert (
        _first_matching_route(f"{base}/features/feature/tasks/reorder", "POST").endpoint.__name__
        == "reorder_tasks"
    )
    assert (
        _first_matching_route(
            f"{base}/features/feature/acceptance-criteria/reorder", "POST"
        ).endpoint.__name__
        == "reorder_acceptance_criteria"
    )


def test_public_schema_imports_are_the_canonical_models_and_keep_validation() -> None:
    assert WorkspaceCreate is CanonicalWorkspaceCreate
    assert FeatureResponse is CanonicalFeatureResponse
    assert CandidateCreate is CanonicalCandidateCreate
    assert CandidateUpdate is CanonicalCandidateUpdate
    assert VerificationResponse is CanonicalVerificationResponse
    assert InvariantResponse is CanonicalInvariantResponse
    assert ApplicableInvariantResponse is CanonicalApplicableInvariantResponse
    assert CandidateUpdate.__base__ is CandidateCreate
    assert ApplicableInvariantResponse.__base__ is InvariantResponse

    valid = WorkspaceCreate.model_validate({"name": "Forge", "description": None})
    assert valid.model_dump() == {"name": "Forge", "description": None}
    with pytest.raises(ValidationError):
        WorkspaceCreate.model_validate({"name": "  "})
