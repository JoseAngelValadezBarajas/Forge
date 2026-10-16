from __future__ import annotations

import json
import os
import socket
import sqlite3
import stat
import subprocess
import sys
import time
from pathlib import Path
from urllib.error import URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"


def _free_port() -> int:
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return int(listener.getsockname()[1])


def _api(base_url: str, path: str, method: str = "GET", payload: object = None) -> object:
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    request = Request(
        f"{base_url}{path}",
        data=body,
        headers={"Content-Type": "application/json"} if body is not None else {},
        method=method,
    )
    with urlopen(request, timeout=3) as response:
        return json.load(response)


def _wait_until_healthy(process: subprocess.Popen[bytes], base_url: str, log_path: Path) -> None:
    deadline = time.monotonic() + 30
    last_error = "server did not become healthy"
    while time.monotonic() < deadline:
        if process.poll() is not None:
            break
        try:
            health = _api(base_url, "/api/health")
            if isinstance(health, dict) and health.get("status") == "ok":
                return
            last_error = f"unexpected health response: {health!r}"
        except (OSError, URLError) as exc:
            last_error = str(exc)
        time.sleep(0.2)
    log = log_path.read_text(encoding="utf-8", errors="replace")
    raise AssertionError(f"temporary Forge server failed health check: {last_error}\n{log}")


def _stop_owned_process(process: subprocess.Popen[bytes]) -> None:
    if process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=10)


def test_fnd02_database_migrates_incrementally_to_current_head(tmp_path: Path) -> None:
    database_url = f"sqlite:///{(tmp_path / 'incremental.db').as_posix()}"
    env = os.environ.copy()
    env["FORGE_DATABASE_URL"] = database_url

    for revision in ("20261013_0003", "head"):
        migration = subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", revision],
            cwd=ROOT,
            env=env,
            capture_output=True,
            text=True,
            timeout=90,
            check=False,
        )
        assert migration.returncode == 0, migration.stdout + migration.stderr


def test_workspace_project_and_feature_survive_backend_process_restart(tmp_path: Path) -> None:
    database_path = tmp_path / "alpha-restart.db"
    database_url = f"sqlite:///{database_path.as_posix()}"
    env = os.environ.copy()
    env["FORGE_DATABASE_URL"] = database_url
    env["FORGE_LOG_LEVEL"] = "WARNING"

    migration = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=ROOT,
        env=env,
        capture_output=True,
        text=True,
        timeout=90,
        check=False,
    )
    assert migration.returncode == 0, migration.stdout + migration.stderr

    initialized = subprocess.run(
        [sys.executable, "-m", "app.initialization"],
        cwd=BACKEND,
        env=env,
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    assert initialized.returncode == 0, initialized.stdout + initialized.stderr
    workspace_id = initialized.stdout.strip().splitlines()[-1]

    port = _free_port()
    base_url = f"http://127.0.0.1:{port}"
    log_path = tmp_path / "uvicorn.log"
    with log_path.open("wb") as log:
        def start_server() -> subprocess.Popen[bytes]:
            return subprocess.Popen(
                [
                    sys.executable,
                    "-m",
                    "uvicorn",
                    "app.main:app",
                    "--host",
                    "127.0.0.1",
                    "--port",
                    str(port),
                ],
                cwd=BACKEND,
                env=env,
                stdout=log,
                stderr=subprocess.STDOUT,
            )

        first = start_server()
        try:
            _wait_until_healthy(first, base_url, log_path)
            workspace_list = _api(base_url, "/api/workspaces")
            assert isinstance(workspace_list, list)
            assert any(item["id"] == workspace_id for item in workspace_list)

            project = _api(
                base_url,
                f"/api/workspaces/{workspace_id}/projects",
                "POST",
                {"name": "Alpha persistence fixture", "description": "Temporary restart check."},
            )
            assert isinstance(project, dict)
            project_id = project["id"]
            feature = _api(
                base_url,
                f"/api/workspaces/{workspace_id}/projects/{project_id}/features",
                "POST",
                {"title": "Persist a planned feature", "goal": "Survive process restart."},
            )
            assert isinstance(feature, dict)
            feature_id = feature["id"]
        finally:
            _stop_owned_process(first)

        second = start_server()
        try:
            _wait_until_healthy(second, base_url, log_path)
            reloaded_project = _api(
                base_url,
                f"/api/workspaces/{workspace_id}/projects/{project_id}",
            )
            reloaded_feature = _api(
                base_url,
                f"/api/workspaces/{workspace_id}/projects/{project_id}/features/{feature_id}",
            )
            assert isinstance(reloaded_project, dict)
            assert reloaded_project["name"] == "Alpha persistence fixture"
            assert isinstance(reloaded_feature, dict)
            assert reloaded_feature["title"] == "Persist a planned feature"
        finally:
            _stop_owned_process(second)


def test_sqlite_online_backup_and_restore_preserve_fixture_data(tmp_path: Path) -> None:
    source_path = tmp_path / "source.db"
    backup_path = tmp_path / "private-backups" / "alpha-fixture.db"
    restore_path = tmp_path / "restored" / "alpha-fixture.db"
    backup_path.parent.mkdir()
    restore_path.parent.mkdir()

    with sqlite3.connect(source_path) as source:
        source.execute("PRAGMA journal_mode=WAL")
        source.execute("CREATE TABLE alpha_fixture (value TEXT NOT NULL)")
        source.execute("INSERT INTO alpha_fixture VALUES (?)", ("preserved planning record",))
        source.commit()
        with sqlite3.connect(backup_path) as backup:
            source.backup(backup)

    with sqlite3.connect(backup_path) as backup:
        assert backup.execute("PRAGMA integrity_check").fetchone() == ("ok",)
        with sqlite3.connect(restore_path) as restored:
            backup.backup(restored)

    with sqlite3.connect(source_path) as source, sqlite3.connect(restore_path) as restored:
        assert source.execute("SELECT value FROM alpha_fixture").fetchone() == (
            "preserved planning record",
        )
        assert restored.execute("PRAGMA integrity_check").fetchone() == ("ok",)
        assert restored.execute("SELECT value FROM alpha_fixture").fetchone() == (
            "preserved planning record",
        )

    if os.name != "nt":
        os.chmod(backup_path, 0o600)
        os.chmod(restore_path, 0o600)
        assert stat.S_IMODE(backup_path.stat().st_mode) == 0o600
        assert stat.S_IMODE(restore_path.stat().st_mode) == 0o600
