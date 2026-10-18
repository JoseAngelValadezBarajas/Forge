"""Export the exact FastAPI API route surface used by the Tauri IPC bridge."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "desktop" / "src-tauri" / "resources" / "api-routes.json"
HTTP_METHODS = {"delete", "get", "patch", "post", "put"}
PARAMETER_NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
PATH_PARAMETER = re.compile(r"^\{[A-Za-z_][A-Za-z0-9_]*\}$")
PATH_SEGMENT = re.compile(r"^[A-Za-z0-9._~-]+$")


def _validate_api_path(path: str) -> None:
    if not path.startswith("/api/") and path != "/api":
        raise ValueError(f"API route has an unexpected prefix: {path!r}")
    if "\\" in path or "?" in path or "#" in path or "%" in path:
        raise ValueError(f"API route contains an unsafe path character: {path!r}")
    if path != "/api" and any(not segment for segment in path[1:].split("/")):
        raise ValueError(f"API route contains an empty path segment: {path!r}")
    for segment in path.strip("/").split("/"):
        if segment.startswith("{") or segment.endswith("}"):
            if not PATH_PARAMETER.fullmatch(segment):
                raise ValueError(f"API route contains an invalid path parameter: {path!r}")
        elif not PATH_SEGMENT.fullmatch(segment) or segment in {".", ".."}:
            raise ValueError(f"API route contains an invalid path segment: {path!r}")


def _query_parameters(path_item: dict[str, Any], operation: dict[str, Any], path: str) -> list[str]:
    query_names: set[str] = set()
    for source in (path_item.get("parameters", []), operation.get("parameters", [])):
        if not isinstance(source, list):
            raise ValueError(f"API route has malformed parameter declarations: {path!r}")
        for parameter in source:
            if not isinstance(parameter, dict):
                raise ValueError(f"API route has malformed parameter declarations: {path!r}")
            if "$ref" in parameter:
                raise ValueError(f"API route has an unresolved parameter reference: {path!r}")
            if parameter.get("in") != "query":
                continue
            name = parameter.get("name")
            if not isinstance(name, str) or not PARAMETER_NAME.fullmatch(name):
                raise ValueError(f"API route has an invalid query parameter: {path!r}")
            query_names.add(name)
    return sorted(query_names)


def build_manifest(openapi: dict[str, Any]) -> dict[str, dict[str, list[str]]]:
    """Return sorted `/api` path templates, methods and query names only."""
    paths = openapi.get("paths")
    if not isinstance(paths, dict):
        raise ValueError("OpenAPI document has no valid paths object")

    manifest: dict[str, dict[str, list[str]]] = {}
    for path in sorted(paths):
        if not isinstance(path, str):
            raise ValueError("OpenAPI route path must be a string")
        if path != "/api" and not path.startswith("/api/"):
            continue
        _validate_api_path(path)
        path_item = paths[path]
        if not isinstance(path_item, dict):
            raise ValueError(f"API route definition is malformed: {path!r}")

        operations: dict[str, list[str]] = {}
        for method in sorted(HTTP_METHODS):
            operation = path_item.get(method)
            if operation is None:
                continue
            if not isinstance(operation, dict):
                raise ValueError(f"API operation is malformed: {method.upper()} {path}")
            operations[method] = _query_parameters(path_item, operation, path)
        if operations:
            manifest[path] = operations
    if not manifest:
        raise ValueError("OpenAPI document contains no registered /api operations")
    return manifest


def render_manifest(manifest: dict[str, dict[str, list[str]]]) -> str:
    return json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def live_manifest() -> dict[str, dict[str, list[str]]]:
    # Route export must never import the developer's configured database URL.
    os.environ["FORGE_DATABASE_URL"] = "sqlite:///:memory:"
    os.environ["FORGE_RUNTIME_MODE"] = "development"
    sys.path.insert(0, str(ROOT / "backend"))
    from app.main import app

    return build_manifest(app.openapi())


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--check", action="store_true", help="fail if output is stale or missing")
    args = parser.parse_args()
    expected = render_manifest(live_manifest())

    if args.check:
        try:
            actual = args.output.read_text(encoding="utf-8")
        except OSError as exc:
            print(f"Desktop API route manifest is unavailable: {exc}", file=sys.stderr)
            return 1
        if actual != expected:
            print(f"Desktop API route manifest is stale: {args.output}", file=sys.stderr)
            return 1
        print(f"Desktop API route manifest matches OpenAPI ({len(json.loads(expected))} paths).")
        return 0

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(expected, encoding="utf-8", newline="\n")
    print(f"Wrote desktop API route manifest: {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
