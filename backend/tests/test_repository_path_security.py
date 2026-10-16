from pathlib import Path

import pytest

from app.application.common.errors import InvalidInput
from app.application.repositories import RepositoryService


def test_repository_path_is_allowed_under_canonical_root(tmp_path: Path) -> None:
    allowed_root = tmp_path / "approved"
    repository = allowed_root / "nested" / "repo"
    repository.mkdir(parents=True)

    normalized = RepositoryService._normalized_path(str(repository), (allowed_root,))

    assert normalized == repository.resolve()


def test_repository_path_rejects_traversal_outside_approved_root(tmp_path: Path) -> None:
    allowed_root = tmp_path / "approved"
    allowed_root.mkdir()
    outside = tmp_path / "outside"
    outside.mkdir()
    traversal_path = allowed_root / ".." / "outside"

    with pytest.raises(InvalidInput, match="approved local root"):
        RepositoryService._normalized_path(str(traversal_path), (allowed_root,))


def test_repository_path_rejects_symlink_escape(tmp_path: Path) -> None:
    allowed_root = tmp_path / "approved"
    allowed_root.mkdir()
    outside = tmp_path / "outside"
    outside.mkdir()
    escape = allowed_root / "escape"
    try:
        escape.symlink_to(outside, target_is_directory=True)
    except OSError as exc:
        pytest.skip(f"directory symlinks are unavailable: {exc}")

    with pytest.raises(InvalidInput, match="approved local root"):
        RepositoryService._normalized_path(str(escape), (allowed_root,))
