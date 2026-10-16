"""Static dependency checks for the canonical backend application layer."""

from __future__ import annotations

import argparse
import ast
from collections.abc import Iterable
from pathlib import Path

_COMPATIBILITY_FACADES = {
    "app.application.services",
    "app.application.runs",
    "app.application.git_context",
}


def _module_name(source_root: Path, path: Path) -> str:
    relative = path.relative_to(source_root)
    parts = list(relative.with_suffix("").parts)
    if parts[-1] == "__init__":
        parts.pop()
    return ".".join(("app", *parts))


def _resolve_import(
    module: str,
    node: ast.Import | ast.ImportFrom,
    *,
    is_package: bool,
    known_modules: set[str],
) -> set[str]:
    if isinstance(node, ast.Import):
        return {alias.name for alias in node.names}
    if node.level:
        package = module if is_package else module.rpartition(".")[0]
        base_parts = package.split(".")
        keep = len(base_parts) - (node.level - 1)
        if keep < 1:
            return set()
        base = ".".join(base_parts[:keep])
        imported = f"{base}.{node.module}" if node.module else base
    else:
        imported = node.module or ""
    if not imported:
        return set()
    resolved = {imported}
    for alias in node.names:
        child = f"{imported}.{alias.name}"
        if child in known_modules:
            resolved.add(child)
    return resolved


def _cycle_paths(graph: dict[str, set[str]]) -> list[list[str]]:
    cycles: list[list[str]] = []
    active: list[str] = []
    active_set: set[str] = set()
    complete: set[str] = set()

    def visit(module: str) -> None:
        if module in complete:
            return
        active.append(module)
        active_set.add(module)
        for dependency in sorted(graph.get(module, set())):
            if dependency not in graph:
                continue
            if dependency in active_set:
                start = active.index(dependency)
                cycle = active[start:] + [dependency]
                if cycle not in cycles:
                    cycles.append(cycle)
            else:
                visit(dependency)
        active.pop()
        active_set.remove(module)
        complete.add(module)

    for module in sorted(graph):
        visit(module)
    return cycles


def check_architecture(source_root: Path) -> list[str]:
    """Return boundary violations found under the supplied ``app`` source root."""
    resolved_root = source_root.resolve()
    if not resolved_root.is_dir():
        return [f"Application source root does not exist: {resolved_root}"]

    files = sorted(resolved_root.rglob("*.py"))
    module_paths = {_module_name(resolved_root, path): path for path in files}
    graph: dict[str, set[str]] = {
        module: set() for module in module_paths if module.startswith("app.application")
    }
    violations: list[str] = []

    for module, path in module_paths.items():
        try:
            tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        except (OSError, SyntaxError, UnicodeError) as exc:
            violations.append(f"Cannot parse {path}: {exc}")
            continue

        for node in ast.walk(tree):
            if not isinstance(node, (ast.Import, ast.ImportFrom)):
                continue
            imported_modules = _resolve_import(
                module,
                node,
                is_package=path.name == "__init__.py",
                known_modules=set(module_paths),
            )
            for imported in imported_modules:
                if module.startswith("app.application") and imported.startswith("app.application"):
                    if module in graph and imported in graph and module != imported:
                        graph[module].add(imported)

                if module.startswith("app.domain") and imported.startswith(
                    ("app.application", "app.persistence", "app.api")
                ):
                    violations.append(
                        f"{path}:{node.lineno}: domain code cannot depend on {imported}"
                    )
                if module.startswith("app.persistence") and imported.startswith(
                    ("app.application", "app.api")
                ):
                    violations.append(
                        f"{path}:{node.lineno}: persistence code cannot depend on {imported}"
                    )
                if module.startswith("app.application"):
                    if imported.startswith("app.api"):
                        violations.append(
                            f"{path}:{node.lineno}: application code cannot depend on {imported}"
                        )
                    if module not in _COMPATIBILITY_FACADES and imported in _COMPATIBILITY_FACADES:
                        violations.append(
                            f"{path}:{node.lineno}: import canonical ownership instead of "
                            f"compatibility facade {imported}"
                        )

    for cycle in _cycle_paths(graph):
        violations.append("Application import cycle: " + " -> ".join(cycle))
    return violations


def _format_violations(violations: Iterable[str]) -> str:
    return "\n".join(f"- {item}" for item in violations)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "app",
        help="backend app source root (defaults to this repository's backend/app)",
    )
    args = parser.parse_args()
    violations = check_architecture(args.root)
    if violations:
        print("Backend architecture boundary check failed:\n" + _format_violations(violations))
        return 1
    print("Backend architecture boundaries passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
