from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Forge"
    app_version: str = "0.1.0"
    environment: str = "development"
    database_url: str = "sqlite:///./forge.db"
    frontend_origin: str = "http://localhost:5173"
    log_level: str = "INFO"

    model_config = SettingsConfigDict(env_prefix="FORGE_", env_file=".env", extra="ignore")

    @property
    def database_path(self) -> Path | None:
        if not self.database_url.startswith("sqlite:///"):
            return None
        return Path(self.database_url.removeprefix("sqlite:///"))


@lru_cache
def get_settings() -> Settings:
    return Settings()

