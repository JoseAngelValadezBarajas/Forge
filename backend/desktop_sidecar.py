"""Authenticated, single-launch FastAPI sidecar for the Forge desktop host."""

from __future__ import annotations

import asyncio
import contextlib
import json
import os
import secrets
import socket
import sqlite3
import subprocess
import sys
import threading
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import BinaryIO
from uuid import uuid4

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory

from app.desktop_runtime import BOOTSTRAP_MAX_BYTES, SESSION_SECRET_BYTES

ROOT = Path(__file__).resolve().parents[1]
DATABASE_URL_PREFIX = "sqlite:///"
READY_PREFIX = "FORGE_READY "


class BootstrapError(ValueError):
    """Safe bootstrap error; messages never include input values."""


class MigrationError(RuntimeError):
    """A migration failed without replacing the user's existing database."""


@dataclass(frozen=True)
class Bootstrap:
    database_path: Path
    session_secret: bytes = field(repr=False)


def read_bootstrap(stream: BinaryIO) -> Bootstrap:
    raw = stream.readline(BOOTSTRAP_MAX_BYTES + 1)
    if len(raw) > BOOTSTRAP_MAX_BYTES or not raw.endswith(b"\n"):
        raise BootstrapError("invalid desktop bootstrap message")
    try:
        payload = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise BootstrapError("invalid desktop bootstrap message") from exc
    if not isinstance(payload, dict) or set(payload) != {"session_secret", "database_path"}:
        raise BootstrapError("invalid desktop bootstrap message")

    encoded_secret = payload.get("session_secret")
    raw_path = payload.get("database_path")
    if not isinstance(encoded_secret, str) or len(encoded_secret) != SESSION_SECRET_BYTES * 2:
        raise BootstrapError("invalid desktop bootstrap message")
    try:
        session_secret = bytes.fromhex(encoded_secret)
    except ValueError as exc:
        raise BootstrapError("invalid desktop bootstrap message") from exc
    if len(session_secret) != SESSION_SECRET_BYTES:
        raise BootstrapError("invalid desktop bootstrap message")
    if not isinstance(raw_path, str) or not raw_path:
        raise BootstrapError("invalid desktop bootstrap message")
    database_path = Path(raw_path).expanduser()
    if not database_path.is_absolute() or database_path.suffix.lower() not in {".db", ".sqlite3"}:
        raise BootstrapError("invalid desktop bootstrap message")
    return Bootstrap(database_path=database_path.resolve(), session_secret=session_secret)


def bind_loopback_socket() -> socket.socket:
    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 0)
        listener.bind(("127.0.0.1", 0))
        listener.listen(128)
        return listener
    except OSError:
        listener.close()
        raise


def _resource_root() -> Path:
    frozen_root = getattr(sys, "_MEIPASS", None)
    if frozen_root is not None:
        return Path(frozen_root)
    return ROOT


def _migration_paths() -> tuple[Path, Path]:
    root = _resource_root()
    migrations = (
        root / "migrations"
        if getattr(sys, "frozen", False)
        else root / "backend" / "migrations"
    )
    ini = root / "alembic.ini"
    return ini, migrations


def _alembic_config(database_path: Path | None = None) -> Config:
    ini, migrations = _migration_paths()
    if not ini.is_file() or not migrations.is_dir():
        raise MigrationError("bundled migration resources are unavailable")
    config = Config(str(ini))
    config.set_main_option("script_location", str(migrations))
    if database_path is not None:
        config.set_main_option("sqlalchemy.url", _sqlite_url(database_path))
    return config


def _sqlite_url(path: Path) -> str:
    return f"{DATABASE_URL_PREFIX}{path.resolve().as_posix()}"


def _head_revision() -> str:
    scripts = ScriptDirectory.from_config(_alembic_config())
    heads = scripts.get_heads()
    if len(heads) != 1:
        raise MigrationError("database migration chain is not a single linear head")
    return heads[0]


def _database_revision(path: Path) -> str | None:
    if not path.exists():
        return None
    with contextlib.closing(sqlite3.connect(path)) as connection:
        result = connection.execute("PRAGMA integrity_check").fetchone()
        if result != ("ok",):
            raise MigrationError("existing SQLite database failed its integrity check")
        exists = connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='alembic_version'"
        ).fetchone()
        if exists is None:
            return None
        revisions = connection.execute("SELECT version_num FROM alembic_version").fetchall()
    if len(revisions) > 1:
        raise MigrationError("database has multiple migration heads")
    return str(revisions[0][0]) if revisions else None


def _unique_backup_path(database_path: Path) -> Path:
    backup_directory = database_path.parent.parent / "backups"
    backup_directory.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    candidate = backup_directory / f"forge-{timestamp}.db"
    if candidate.exists():
        candidate = backup_directory / f"forge-{timestamp}-{uuid4().hex[:8]}.db"
    return candidate


def _sqlite_copy(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with contextlib.closing(sqlite3.connect(source)) as source_connection, contextlib.closing(
        sqlite3.connect(destination)
    ) as destination_connection:
        source_connection.backup(destination_connection)
        destination_connection.commit()
    with contextlib.closing(sqlite3.connect(destination)) as verification:
        if verification.execute("PRAGMA integrity_check").fetchone() != ("ok",):
            raise MigrationError("SQLite backup failed its integrity check")


def _migrate_child(database_path: Path) -> None:
    os.environ["FORGE_DATABASE_URL"] = _sqlite_url(database_path)
    os.environ["FORGE_RUNTIME_MODE"] = "desktop"
    backend_path = _resource_root()
    if str(backend_path) not in sys.path:
        sys.path.insert(0, str(backend_path))
    command.upgrade(_alembic_config(database_path), "head")


def _run_migration_child(database_path: Path) -> None:
    if getattr(sys, "frozen", False):
        command = [sys.executable, "--migrate-database", str(database_path)]
    else:
        command = [
            sys.executable,
            str(Path(__file__).resolve()),
            "--migrate-database",
            str(database_path),
        ]
    child_environment = os.environ.copy()
    child_environment["FORGE_DATABASE_URL"] = _sqlite_url(database_path)
    child_environment["FORGE_RUNTIME_MODE"] = "desktop"
    try:
        result = subprocess.run(
            command,
            check=False,
            capture_output=True,
            text=True,
            timeout=180,
            env=child_environment,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise MigrationError("SQLite migration process could not complete") from exc
    if result.returncode != 0:
        raise MigrationError("SQLite migration failed; the existing database was preserved")


def migrate_database(database_path: Path) -> str:
    database_path = database_path.expanduser().resolve()
    if database_path.suffix.lower() not in {".db", ".sqlite3"}:
        raise MigrationError("desktop database path must use a SQLite filename")
    database_path.parent.mkdir(parents=True, exist_ok=True)
    head = _head_revision()
    current = _database_revision(database_path)
    if current == head:
        return head

    existed = database_path.exists()
    if existed:
        backup = _unique_backup_path(database_path)
        _sqlite_copy(database_path, backup)
    staged_database = database_path.with_name(
        f".{database_path.stem}.migration-{secrets.token_hex(8)}{database_path.suffix}"
    )
    try:
        if existed:
            _sqlite_copy(database_path, staged_database)
        _run_migration_child(staged_database)
        if not staged_database.is_file():
            raise MigrationError("SQLite migration did not create a database")
        with contextlib.closing(sqlite3.connect(staged_database)) as connection:
            if connection.execute("PRAGMA integrity_check").fetchone() != ("ok",):
                raise MigrationError("migrated SQLite database failed its integrity check")
        os.replace(staged_database, database_path)
    except Exception as exc:
        staged_database.unlink(missing_ok=True)
        if isinstance(exc, MigrationError):
            raise
        raise MigrationError(
            "SQLite migration failed; the existing database was preserved"
        ) from exc
    return head


class _ReadyServer:
    """Import-free protocol helpers shared with the asyncio Uvicorn startup."""

    @staticmethod
    def ready_line(port: int) -> str:
        if not 1 <= port <= 65535:
            raise ValueError("invalid bound loopback port")
        return f"{READY_PREFIX}{port}"


async def _serve(bootstrap: Bootstrap) -> None:
    database_path = bootstrap.database_path
    database_path.parent.mkdir(parents=True, exist_ok=True)
    migrate_database(database_path)
    listener = bind_loopback_socket()
    port = listener.getsockname()[1]
    os.environ["FORGE_DATABASE_URL"] = _sqlite_url(database_path)
    os.environ["FORGE_RUNTIME_MODE"] = "desktop"
    os.environ["FORGE_RUNTIME_HOST"] = "127.0.0.1"
    os.environ["FORGE_RUNTIME_PORT"] = str(port)
    os.environ["FORGE_FRONTEND_ORIGIN"] = "http://tauri.localhost"
    os.environ["FORGE_LOG_LEVEL"] = "INFO"

    try:
        import uvicorn

        from app.config import get_settings
        from app.main import create_app

        get_settings.cache_clear()
        settings = get_settings()
        application = create_app(settings, desktop_session_secret=bootstrap.session_secret)

        class ReadyUvicornServer(uvicorn.Server):
            async def startup(self, sockets: list[socket.socket] | None = None) -> None:
                await super().startup(sockets=sockets)
                if self.started:
                    print(_ReadyServer.ready_line(port), file=sys.stdout, flush=True)

        config = uvicorn.Config(
            application,
            host="127.0.0.1",
            port=port,
            log_config=None,
            access_log=False,
            log_level="info",
        )
        server = ReadyUvicornServer(config)

        loop = asyncio.get_running_loop()

        def watch_shutdown_command() -> None:
            while True:
                control = sys.stdin.buffer.readline(128)
                if not control or control == b"FORGE_STOP\n":
                    loop.call_soon_threadsafe(setattr, server, "should_exit", True)
                    return

        threading.Thread(
            target=watch_shutdown_command,
            name="forge-stdin-control",
            daemon=True,
        ).start()
        await server.serve(sockets=[listener])
    finally:
        listener.close()


def _main() -> int:
    if len(sys.argv) == 3 and sys.argv[1] == "--migrate-database":
        try:
            _migrate_child(Path(sys.argv[2]))
        except Exception:
            return 1
        return 0

    try:
        bootstrap = read_bootstrap(sys.stdin.buffer)
        asyncio.run(_serve(bootstrap))
    except BootstrapError:
        print("Forge sidecar received an invalid bootstrap message.", file=sys.stderr, flush=True)
        return 2
    except Exception:
        print(
            "Forge sidecar startup failed; see the local Forge log for details.",
            file=sys.stderr,
            flush=True,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
