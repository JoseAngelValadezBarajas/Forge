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
