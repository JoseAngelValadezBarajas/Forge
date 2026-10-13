from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DATA_DIR = PROJECT_ROOT / ".forge" / "data"
DEFAULT_DATABASE_PATH = DEFAULT_DATA_DIR / "forge.db"


def sqlite_url(path: Path) -> str:
    return f"sqlite:///{path.resolve().as_posix()}"


class Settings(BaseSettings):
    app_name: str = "Forge"
    app_version: str = "0.1.0"
    environment: str = "development"
    database_url: str | None = None
    frontend_origin: str = "http://localhost:5173"
    log_level: str = "INFO"

    model_config = SettingsConfigDict(
        env_prefix="FORGE_",
        env_file=(PROJECT_ROOT / ".env", PROJECT_ROOT / "backend" / ".env"),
        extra="ignore",
    )

    @property
    def database_path(self) -> Path | None:
        database_url = self.database_url
        if database_url is None:
            return DEFAULT_DATABASE_PATH
        if not database_url.startswith("sqlite:///"):
            return None
        raw_path = database_url.removeprefix("sqlite:///")
        if raw_path == ":memory:":
            return None
        path = Path(raw_path)
        return (path if path.is_absolute() else PROJECT_ROOT / path).resolve()

    @property
    def resolved_database_url(self) -> str:
        if self.database_path is not None:
            return sqlite_url(self.database_path)
        if self.database_url is not None:
            return self.database_url
        return sqlite_url(DEFAULT_DATABASE_PATH)


@lru_cache
def get_settings() -> Settings:
    return Settings()

