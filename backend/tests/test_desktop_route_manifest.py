from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path
from typing import Any

try:
    from scripts.export_desktop_api_routes import build_manifest
except ImportError:
    build_manifest = None  # type: ignore[assignment]

ROOT = Path(__file__).resolve().parents[2]


def test_manifest_builder_exists_and_exports_only_registered_api_operations() -> None:
    assert callable(build_manifest), "the OpenAPI route-manifest builder must exist"
    document: dict[str, Any] = {
        "paths": {
            "/api/health": {"get": {"parameters": []}},
            "/api/workspaces": {
                "get": {
                    "parameters": [
                        {"in": "query", "name": "search"},
                        {"in": "path", "name": "workspace_id"},
                    ]
                },
                "post": {"parameters": []},
            },
            "/docs": {"get": {"parameters": []}},
            "/openapi.json": {"get": {"parameters": []}},
            "/assets/app.js": {"get": {"parameters": []}},
        }
    }

    assert build_manifest(document) == {
        "/api/health": {"get": []},
        "/api/workspaces": {"get": ["search"], "post": []},
    }


def test_manifest_merges_path_and_operation_query_parameters() -> None:
    assert callable(build_manifest), "the OpenAPI route-manifest builder must exist"
    document: dict[str, Any] = {
        "paths": {
            "/api/items/{item_id}": {
                "parameters": [{"in": "query", "name": "shared"}],
                "get": {
                    "parameters": [
                        {"in": "query", "name": "format"},
                        {"in": "path", "name": "item_id"},
                    ]
                },
            }
        }
    }

    assert build_manifest(document) == {
        "/api/items/{item_id}": {"get": ["format", "shared"]}
    }


def test_manifest_generation_is_deterministic() -> None:
    assert callable(build_manifest), "the OpenAPI route-manifest builder must exist"
    document: dict[str, Any] = {
        "paths": {
            "/api/z": {"get": {"parameters": []}},
            "/api/a": {"post": {"parameters": []}},
        }
    }

    assert list(build_manifest(document)) == ["/api/a", "/api/z"]


def test_manifest_rejects_malformed_api_path_or_query_declarations() -> None:
    assert callable(build_manifest), "the OpenAPI route-manifest builder must exist"
    malformed: dict[str, Any] = {
        "paths": {
            "/api//ambiguous": {"get": {"parameters": []}},
        }
    }

    try:
        build_manifest(malformed)
    except ValueError as exc:
        assert "route" in str(exc).lower() or "path" in str(exc).lower()
    else:
        raise AssertionError("ambiguous API route was accepted into the IPC allowlist")


def test_checked_in_manifest_matches_live_openapi_route_registry() -> None:
    environment = {
        **os.environ,
        "FORGE_DATABASE_URL": "sqlite:///:memory:",
        "FORGE_RUNTIME_MODE": "development",
    }
    result = subprocess.run(
        [sys.executable, "scripts/export_desktop_api_routes.py", "--check"],
        cwd=ROOT,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr or result.stdout
