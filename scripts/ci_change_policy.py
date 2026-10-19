"""Classify pull-request changes for the expensive desktop validation gate."""

from __future__ import annotations

import argparse
from collections.abc import Iterable, Sequence
from pathlib import Path


DOCUMENTATION_FILES = {
    "changelog",
    "contributing.md",
    "license.md",
    "notice",
    "readme.md",
    "security.md",
    "trademarks.md",
}
DOCUMENTATION_SUFFIXES = (".md", ".markdown", ".txt")


def _normalize(path: str) -> str:
    return path.replace("\\", "/").lstrip("./").lower()


def _is_documentation_only_path(path: str) -> bool:
    normalized = _normalize(path)
    name = normalized.rsplit("/", 1)[-1]
    return (
        normalized.startswith("docs/")
        or name in DOCUMENTATION_FILES
        or name.endswith(DOCUMENTATION_SUFFIXES)
    )


def classify_paths(paths: Iterable[str]) -> str:
    """Return the conservative change class for a set of repository paths."""

    normalized = [_normalize(path) for path in paths if path.strip()]
    if normalized and all(_is_documentation_only_path(path) for path in normalized):
        return "docs-only"
    return "desktop-sensitive"


def desktop_required_for_event(event_name: str, paths: Iterable[str]) -> tuple[bool, str]:
    """Return whether the Windows installed-product gate must run."""

    if event_name != "pull_request":
        return True, "non-pr-event"
    classification = classify_paths(paths)
    return classification == "desktop-sensitive", classification


def _parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--event", required=True)
    parser.add_argument("--paths-file", type=Path, required=True)
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = _parse_args(argv)
    paths = args.paths_file.read_text(encoding="utf-8").splitlines()
    required, classification = desktop_required_for_event(args.event, paths)
    print(f"desktop_required={str(required).lower()}")
    print(f"classification={classification}")
    print(f"reason={classification}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
