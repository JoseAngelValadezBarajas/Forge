from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
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
    runtime_mode: Literal["development", "local"] = "development"
    runtime_host: str = "127.0.0.1"
    runtime_port: int = Field(default=8000, ge=1, le=65535)
    frontend_dist_dir: Path = PROJECT_ROOT / "frontend" / "dist"
    log_level: str = "INFO"
    allowed_repository_roots: list[Path] = Field(
        default_factory=lambda: [Path.home(), PROJECT_ROOT]
    )

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

    @property
    def resolved_allowed_repository_roots(self) -> tuple[Path, ...]:
        roots: list[Path] = []
        for configured_root in self.allowed_repository_roots:
            expanded_root = configured_root.expanduser()
            if not expanded_root.is_absolute():
                raise ValueError("Allowed repository roots must be absolute")
            try:
                root = expanded_root.resolve(strict=True)
            except (OSError, RuntimeError) as exc:
                raise ValueError("Allowed repository roots must exist") from exc
            if not root.is_dir():
                raise ValueError("Allowed repository roots must be directories")
            if root not in roots:
                roots.append(root)
        if not roots:
            raise ValueError("At least one allowed repository root must be configured")
        return tuple(roots)


@lru_cache
def get_settings() -> Settings:
    return Settings()

