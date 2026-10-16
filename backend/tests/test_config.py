import json
from pathlib import Path

import pytest

from app.config import DEFAULT_DATABASE_PATH, Settings, sqlite_url


def test_default_database_path_is_repo_relative_not_cwd_relative(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repository_root = Path(__file__).resolve().parents[2]
    expected_path = repository_root / ".forge" / "data" / "forge.db"

    for working_directory in (repository_root, repository_root / "backend"):
        monkeypatch.chdir(working_directory)
        settings = Settings()
        assert settings.database_path == expected_path.resolve()
        assert settings.resolved_database_url == sqlite_url(expected_path)

    assert DEFAULT_DATABASE_PATH == expected_path


def test_relative_sqlite_override_is_also_resolved_from_repository_root(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repository_root = Path(__file__).resolve().parents[2]
    monkeypatch.chdir(repository_root / "backend")

    settings = Settings(database_url="sqlite:///custom/forge.db")

    assert settings.database_path == (repository_root / "custom" / "forge.db").resolve()
    assert settings.resolved_database_url == sqlite_url(repository_root / "custom" / "forge.db")


def test_allowed_repository_roots_are_configurable_and_resolved(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    approved_root = tmp_path / "approved"
    approved_root.mkdir()
    monkeypatch.setenv(
        "FORGE_ALLOWED_REPOSITORY_ROOTS", json.dumps([str(approved_root)])
    )

    settings = Settings(_env_file=None)  # type: ignore[call-arg]

    assert settings.resolved_allowed_repository_roots == (approved_root.resolve(),)


def test_default_repository_roots_are_bounded_to_local_trusted_directories() -> None:
    settings = Settings(_env_file=None)  # type: ignore[call-arg]

    assert settings.resolved_allowed_repository_roots == (
        Path.home().resolve(),
        Path(__file__).resolve().parents[2],
    )


def test_allowed_repository_roots_must_be_absolute_directories() -> None:
    settings = Settings(allowed_repository_roots=[Path(".")])

    with pytest.raises(ValueError, match="must be absolute"):
        _ = settings.resolved_allowed_repository_roots
