from __future__ import annotations

import contextlib
import io
import json
import os
import queue
import select
import socket
import sqlite3
import subprocess
import sys
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import Settings
from app.db import Base, get_db
from app.main import create_app
from desktop_sidecar import (
    BootstrapError,
    bind_loopback_socket,
    migrate_database,
    read_bootstrap,
)

ROOT = Path(__file__).resolve().parents[2]
TAURI_ORIGIN = "http://tauri.localhost"
SESSION = b"0123456789abcdef0123456789abcdef"


def _desktop_app() -> FastAPI:
    settings = Settings(
        _env_file=None,  # type: ignore[call-arg]
        runtime_mode="desktop",
        runtime_host="127.0.0.1",
        runtime_port=47821,
        database_url="sqlite:///:memory:",
    )
    return create_app(settings, desktop_session_secret=SESSION)


@contextmanager
def _override_database(application: FastAPI) -> Iterator[None]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    def override_db() -> Iterator[Session]:
        with sessions() as session:
            yield session

    application.dependency_overrides[get_db] = override_db
    try:
        yield
    finally:
        application.dependency_overrides.clear()
        engine.dispose()


def _headers(*, token: bytes = SESSION) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token.hex()}",
        "Origin": TAURI_ORIGIN,
    }


def test_desktop_runtime_authenticates_health_reads_and_mutations() -> None:
    application = _desktop_app()
    with _override_database(application), TestClient(
        application, base_url="http://127.0.0.1:47821"
    ) as client:
        created = client.post(
            "/api/workspaces", json={"name": "Desktop workspace"}, headers=_headers()
        )
        health = client.get("/api/health", headers=_headers())
        listed = client.get("/api/workspaces", headers=_headers())

    assert created.status_code == 201
    assert health.status_code == 200
    assert [workspace["name"] for workspace in listed.json()] == ["Desktop workspace"]


def test_desktop_rejects_missing_or_wrong_capability_before_route_access() -> None:
    application = _desktop_app()

    def forbidden_db() -> Iterator[Session]:
        raise AssertionError("unauthenticated request reached database dependency")
        yield  # pragma: no cover

    application.dependency_overrides[get_db] = forbidden_db
    with TestClient(application, base_url="http://127.0.0.1:47821") as client:
        cases = [
            client.get("/api/health"),
            client.get("/api/workspaces"),
            client.get("/api/workspaces", headers=_headers(token=b"wrong")),
            client.post("/api/workspaces", json={"name": "Denied"}),
        ]

    assert [response.status_code for response in cases] == [401, 401, 401, 401]
    assert all(response.json() == {"detail": "Desktop session required"} for response in cases)


def test_desktop_rejects_ambiguous_authentication_and_origin_headers() -> None:
    application = _desktop_app()
    with TestClient(application, base_url="http://127.0.0.1:47821") as client:
        duplicate_auth = client.get(
            "/api/health",
            headers=[
                ("Authorization", f"Bearer {SESSION.hex()}"),
                ("Authorization", f"Bearer {bytes(32).hex()}"),
            ],
        )
        duplicate_origin = client.post(
            "/api/workspaces",
            json={"name": "Ambiguous origin"},
            headers=[
                ("Authorization", f"Bearer {SESSION.hex()}"),
                ("Origin", TAURI_ORIGIN),
                ("Origin", "http://attacker.invalid"),
            ],
        )
    assert duplicate_auth.status_code == 401
    assert duplicate_origin.status_code == 403


@pytest.mark.parametrize("method", ["GET", "HEAD", "OPTIONS", "POST", "PATCH", "DELETE"])
def test_every_desktop_api_method_requires_the_launch_capability(method: str) -> None:
    application = _desktop_app()
    with TestClient(application, base_url="http://127.0.0.1:47821") as client:
        response = client.request(method, "/api/health")
    assert response.status_code == 401


def test_desktop_preserves_host_and_exact_mutation_origin_checks() -> None:
    application = _desktop_app()
    with _override_database(application), TestClient(
        application, base_url="http://127.0.0.1:47821"
    ) as client:
        invalid_host = client.get(
            "/api/health", headers={**_headers(), "Host": "attacker.invalid:47821"}
        )
        invalid_origin = client.post(
            "/api/workspaces",
            json={"name": "Denied"},
            headers={**_headers(), "Origin": "http://attacker.invalid"},
        )
        accepted = client.post(
            "/api/workspaces", json={"name": "Accepted"}, headers=_headers()
        )

    assert invalid_host.status_code == 400
    assert invalid_origin.status_code == 403
    assert accepted.status_code == 201


def test_desktop_mode_cannot_be_constructed_without_a_launch_capability() -> None:
    settings = Settings(_env_file=None, runtime_mode="desktop")  # type: ignore[call-arg]
    with pytest.raises(ValueError, match="desktop session capability"):
        create_app(settings)


def test_development_runtime_remains_unauthenticated() -> None:
    settings = Settings(_env_file=None, runtime_mode="development")  # type: ignore[call-arg]
    application = create_app(settings)
    with TestClient(application) as client:
        assert client.get("/api/health").status_code == 200


def test_bootstrap_parser_rejects_missing_malformed_and_oversized_input() -> None:
    for stream in (io.BytesIO(b""), io.BytesIO(b"not-json\n"), io.BytesIO(b"x" * 8193)):
        with pytest.raises(BootstrapError):
            read_bootstrap(stream)


def test_bootstrap_parser_keeps_secret_out_of_repr_and_validates_fields(tmp_path: Path) -> None:
    secret = bytes(range(32))
    message = {
        "session_secret": secret.hex(),
        "database_path": str(tmp_path / "data" / "forge.db"),
    }
    stream = io.BytesIO(json.dumps(message).encode() + b"\nFORGE_STOP\n")
    bootstrap = read_bootstrap(stream)
    assert bootstrap.session_secret == secret
    assert secret.hex() not in repr(bootstrap)
    assert bootstrap.database_path == Path(message["database_path"])
    assert stream.readline() == b"FORGE_STOP\n"

    invalid = {**message, "session_secret": "too-short"}
    with pytest.raises(BootstrapError):
        read_bootstrap(io.BytesIO(json.dumps(invalid).encode() + b"\n"))


def test_sidecar_binds_only_an_ephemeral_ipv4_loopback_socket() -> None:
    listener = bind_loopback_socket()
    try:
        host, port = listener.getsockname()
        assert host == "127.0.0.1"
        assert isinstance(port, int) and 0 < port < 65536
        assert listener.getsockopt(socket.SOL_SOCKET, socket.SO_ACCEPTCONN) == 1
    finally:
        listener.close()


def test_real_sidecar_readiness_authentication_and_owned_shutdown(tmp_path: Path) -> None:
    database = tmp_path / "data" / "forge.db"
    secret = bytes(range(32))
    sentinel = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sentinel.bind(("127.0.0.1", 0))
    sentinel.listen(1)
    sentinel.setblocking(False)
    process = subprocess.Popen(
        [sys.executable, str(ROOT / "backend" / "desktop_sidecar.py")],
        cwd=ROOT,
        env={
            **os.environ,
            "PYTHONPATH": str(ROOT / "backend"),
            "FORGE_RUNTIME_MODE": "development",
            "FORGE_DATABASE_URL": "sqlite:///:memory:",
        },
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        bufsize=1,
    )
    reader_result: queue.Queue[str] = queue.Queue()
    reader = threading.Thread(
        target=lambda: reader_result.put(process.stdout.readline() if process.stdout else ""),
        daemon=True,
    )
    reader.start()
    try:
        assert process.stdin is not None
        bootstrap = {"session_secret": secret.hex(), "database_path": str(database)}
        process.stdin.write(json.dumps(bootstrap) + "\n")
        process.stdin.flush()
        reader.join(timeout=45)
        assert not reader.is_alive(), "sidecar did not emit readiness after startup"
        ready = reader_result.get_nowait().strip()
        assert ready.startswith("FORGE_READY "), ready
        port = int(ready.removeprefix("FORGE_READY "))
        assert 0 < port < 65536
        assert port != sentinel.getsockname()[1]
        with httpx.Client(timeout=5, trust_env=False) as client:
            denied = client.get(f"http://127.0.0.1:{port}/api/health")
            health = client.get(
                f"http://127.0.0.1:{port}/api/health",
                headers={"Authorization": f"Bearer {secret.hex()}"},
            )
            created = client.post(
                f"http://127.0.0.1:{port}/api/workspaces",
                json={"name": "Real sidecar workspace"},
                headers={
                    "Authorization": f"Bearer {secret.hex()}",
                    "Origin": TAURI_ORIGIN,
                },
            )
        assert denied.status_code == 401
        assert health.status_code == 200
        assert created.status_code == 201
        assert select.select([sentinel], [], [], 0.1)[0] == []
        process.stdin.write("FORGE_STOP\n")
        process.stdin.flush()
        process.stdin.close()
        assert process.wait(timeout=15) == 0
        stdout_tail = process.stdout.read() if process.stdout else ""
        stderr_output = process.stderr.read() if process.stderr else ""
        assert secret.hex() not in ready + stdout_tail + stderr_output
        assert (database.parent / "forge.db").is_file()
    finally:
        sentinel.close()
        if process.poll() is None:
            process.terminate()
            process.wait(timeout=10)
        if process.stdin is not None and not process.stdin.closed:
            process.stdin.close()
        if process.stdout is not None:
            process.stdout.close()
        if process.stderr is not None:
            process.stderr.close()


def test_fresh_and_incremental_migrations_use_temporary_sqlite_and_verified_backup(
    tmp_path: Path,
) -> None:
    database = tmp_path / "data" / "forge.db"
    database.parent.mkdir()
    previous_revision = "20261014_0006"
    environment = {
        **os.environ,
        "FORGE_DATABASE_URL": f"sqlite:///{database.as_posix()}",
        "FORGE_RUNTIME_MODE": "development",
    }
    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "alembic",
            "-c",
            "alembic.ini",
            "upgrade",
            previous_revision,
        ],
        cwd=ROOT,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    with contextlib.closing(sqlite3.connect(database)) as connection:
        assert connection.execute("SELECT version_num FROM alembic_version").fetchone() == (
            previous_revision,
        )
        connection.execute("CREATE TABLE preserved_marker (value TEXT NOT NULL)")
        connection.execute("INSERT INTO preserved_marker VALUES ('before upgrade')")
        connection.commit()

    assert migrate_database(database) == "20261014_0007"
    with contextlib.closing(sqlite3.connect(database)) as connection:
        assert connection.execute("PRAGMA integrity_check").fetchone() == ("ok",)
        assert connection.execute("SELECT version_num FROM alembic_version").fetchone() == (
            "20261014_0007",
        )
        assert connection.execute("SELECT value FROM preserved_marker").fetchone() == (
            "before upgrade",
        )
    assert len(list((tmp_path / "backups").glob("forge-*.db"))) == 1


def test_failed_migration_preserves_original_database_and_verified_backup(tmp_path: Path) -> None:
    database = tmp_path / "data" / "forge.db"
    database.parent.mkdir()
    with contextlib.closing(sqlite3.connect(database)) as connection:
        connection.execute("CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL)")
        connection.execute("INSERT INTO alembic_version VALUES ('unknown-revision')")
        connection.execute("CREATE TABLE owner_data (value TEXT NOT NULL)")
        connection.execute("INSERT INTO owner_data VALUES ('preserve me')")
        connection.commit()
    before = database.read_bytes()

    with pytest.raises(RuntimeError, match="migration"):
        migrate_database(database)

    assert database.read_bytes() == before
    backup_files = list((tmp_path / "backups").glob("forge-*.db"))
    assert len(backup_files) == 1
    with contextlib.closing(sqlite3.connect(backup_files[0])) as connection:
        assert connection.execute("PRAGMA integrity_check").fetchone() == ("ok",)
        assert connection.execute("SELECT value FROM owner_data").fetchone() == ("preserve me",)
