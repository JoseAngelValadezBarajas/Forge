"""Build and exercise the opt-in single-origin runtime with temporary SQLite."""

import json
import os
import re
import socket
import sqlite3
import subprocess
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend"
BACKEND = ROOT / "backend"


def _run(command: list[str], *, cwd: Path, env: dict[str, str] | None = None) -> None:
    subprocess.run(command, cwd=cwd, env=env, check=True)


def _free_loopback_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        listener.bind(("127.0.0.1", 0))
        return int(listener.getsockname()[1])


def _request(
    base_url: str,
    path: str,
    *,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    payload: dict[str, object] | None = None,
) -> tuple[int, dict[str, str], bytes]:
    request_headers = headers or {}
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    if payload is not None:
        request_headers = {**request_headers, "Content-Type": "application/json"}
    request = Request(f"{base_url}{path}", data=body, headers=request_headers, method=method)
    try:
        with urlopen(request, timeout=4) as response:
            return (
                response.status,
                {key.lower(): value for key, value in response.headers.items()},
                response.read(),
            )
    except HTTPError as error:
        return error.code, dict(error.headers.items()), error.read()


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def _verify_occupied_port_fails_closed(
    environment: dict[str, str], backend: Path, log_path: Path
) -> None:
    requests: list[tuple[str, str]] = []

    class SentinelHandler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            requests.append(("GET", self.path))
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"status":"ok","service":"Forge"}')

        def do_POST(self) -> None:
            requests.append(("POST", self.path))
            self.send_response(200)
            self.end_headers()

        def log_message(self, format: str, *args: object) -> None:
            return

    sentinel = ThreadingHTTPServer(("127.0.0.1", 0), SentinelHandler)
    sentinel_port = int(sentinel.server_address[1])
    sentinel_thread = threading.Thread(target=sentinel.serve_forever, daemon=True)
    sentinel_thread.start()
    occupied_environment = {**environment, "FORGE_RUNTIME_PORT": str(sentinel_port)}
    process: subprocess.Popen[bytes] | None = None
    try:
        with log_path.open("wb") as log_file:
            process = subprocess.Popen(
                [sys.executable, "-m", "app.local_runtime"],
                cwd=backend,
                env=occupied_environment,
                stdout=log_file,
                stderr=subprocess.STDOUT,
            )
            try:
                exit_code = process.wait(timeout=10)
            except subprocess.TimeoutExpired as exc:
                process.terminate()
                process.wait(timeout=5)
                raise RuntimeError("Runtime did not fail on an occupied loopback port") from exc
    finally:
        if process is not None and process.poll() is None:
            process.terminate()
            process.wait(timeout=5)
        sentinel.shutdown()
        sentinel.server_close()
        sentinel_thread.join(timeout=5)

    _assert(exit_code != 0, "Runtime unexpectedly started on an occupied port")
    _assert(not requests, "The occupied pre-existing server received an E2E request")
    print("PASS: occupied-port startup failed; the pre-existing sentinel received no requests")


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="forge-plt01-") as temporary_root:
        temp = Path(temporary_root)
        database_path = temp / "runtime.db"
        log_path = temp / "uvicorn.log"
        port = _free_loopback_port()
        database_url = f"sqlite:///{database_path.as_posix()}"
        environment = os.environ.copy()
        environment.update(
            {
                "FORGE_RUNTIME_MODE": "local",
                "FORGE_RUNTIME_HOST": "127.0.0.1",
                "FORGE_RUNTIME_PORT": str(port),
                "FORGE_FRONTEND_DIST_DIR": str(FRONTEND / "dist"),
                "FORGE_DATABASE_URL": database_url,
            }
        )

        print("Building the production frontend…", flush=True)
        build_command = (
            [os.environ.get("ComSpec", "cmd.exe"), "/d", "/s", "/c", "npm run build"]
            if os.name == "nt"
            else ["npm", "run", "build"]
        )
        subprocess.run(
            build_command,
            cwd=FRONTEND,
            env=environment,
            check=True,
        )

        print("Migrating an isolated SQLite database…", flush=True)
        _run([sys.executable, "-m", "alembic", "upgrade", "head"], cwd=ROOT, env=environment)
        _verify_occupied_port_fails_closed(environment, BACKEND, temp / "occupied-port-runtime.log")

        server: subprocess.Popen[bytes] | None = None
        try:
            with log_path.open("wb") as log_file:
                server = subprocess.Popen(
                    [sys.executable, "-m", "app.local_runtime"],
                    cwd=BACKEND,
                    env=environment,
                    stdout=log_file,
                    stderr=subprocess.STDOUT,
                )
                base_url = f"http://127.0.0.1:{port}"
                deadline = time.monotonic() + 30
                ready = False
                while time.monotonic() < deadline:
                    exit_code = server.poll()
                    if exit_code is not None:
                        log_file.flush()
                        raise RuntimeError(
                            f"Local runtime exited during startup ({exit_code}); see {log_path}"
                        )
                    log_file.flush()
                    if "Application startup complete" in log_path.read_text(
                        encoding="utf-8", errors="replace"
                    ):
                        ready = True
                        break
                    time.sleep(0.1)
                _assert(ready, f"Local runtime did not start; see {log_path}")

                origin = base_url
                navigation_headers = {
                    "Accept": "text/html,application/xhtml+xml",
                    "Sec-Fetch-Mode": "navigate",
                    "Sec-Fetch-Dest": "document",
                }
                status, headers, body = _request(base_url, "/", headers=navigation_headers)
                html = body.decode("utf-8")
                _assert(
                    status == 200 and headers.get("content-type", "").startswith("text/html"),
                    "Application root did not return the built HTML document",
                )
                _assert(
                    "/src/main.tsx" not in html, "Development source leaked into distribution HTML"
                )

                js_match = re.search(r'<script[^>]+src="(/assets/[^\"]+\.js)"', html)
                css_match = re.search(r'<link[^>]+href="(/assets/[^\"]+\.css)"', html)
                _assert(
                    js_match is not None and css_match is not None,
                    "Built HTML did not reference compiled JavaScript and CSS",
                )
                js_status, js_headers, _ = _request(base_url, js_match.group(1))
                css_status, css_headers, _ = _request(base_url, css_match.group(1))
                _assert(js_status == css_status == 200, "A compiled frontend asset did not load")
                _assert(
                    "javascript" in js_headers.get("content-type", ""),
                    "JavaScript asset has an incorrect MIME type",
                )
                _assert(
                    css_headers.get("content-type", "").startswith("text/css"),
                    "CSS asset has an incorrect MIME type",
                )

                project_id = "project-from-smoke"
                status, _, deep_body = _request(
                    base_url,
                    f"/projects/{project_id}/features/feature-from-smoke",
                    headers=navigation_headers,
                )
                _assert(
                    status == 200 and deep_body == body,
                    "Deep React Router navigation did not return the SPA entrypoint",
                )

                health_status, _, health_body = _request(base_url, "/api/health")
                _assert(
                    health_status == 200 and json.loads(health_body)["status"] == "ok",
                    "Single-origin API health check failed",
                )

                workspace_status, _, workspace_body = _request(
                    base_url,
                    "/api/workspaces",
                    method="POST",
                    headers={"Origin": origin},
                    payload={"name": "PLT-01 Smoke Workspace"},
                )
                _assert(
                    workspace_status == 201, "Workspace creation through same-origin API failed"
                )
                workspace = json.loads(workspace_body)
                project_status, _, project_body = _request(
                    base_url,
                    f"/api/workspaces/{workspace['id']}/projects",
                    method="POST",
                    headers={"Origin": origin},
                    payload={"name": "PLT-01 Smoke Project"},
                )
                _assert(project_status == 201, "Project creation through same-origin API failed")
                project = json.loads(project_body)
                listed_status, _, listed_body = _request(
                    base_url, f"/api/workspaces/{workspace['id']}/projects"
                )
                _assert(
                    listed_status == 200
                    and any(item["id"] == project["id"] for item in json.loads(listed_body)),
                    "Created project was not returned by the real API",
                )

                denied_status, _, _ = _request(
                    base_url,
                    "/api/workspaces",
                    method="POST",
                    headers={"Origin": "http://attacker.invalid", "Host": "attacker.invalid"},
                    payload={"name": "Must Be Rejected"},
                )
                _assert(
                    denied_status == 403, "A spoofed Host did not authorize a cross-origin write"
                )

                missing_asset_status, _, missing_asset_body = _request(
                    base_url,
                    "/assets/not-built.js",
                    headers=navigation_headers,
                )
                missing_api_status, missing_api_headers, missing_api_body = _request(
                    base_url, "/api/not-a-route", headers=navigation_headers
                )
                traversal_status, _, traversal_body = _request(
                    base_url, "/assets/%2e%2e%2f..%2fbackend%2fapp%2fmain.py"
                )
                _assert(
                    missing_asset_status == 404 and b"<html" not in missing_asset_body.lower(),
                    "Unknown assets must return 404, not the frontend entrypoint",
                )
                _assert(
                    missing_api_status == 404
                    and missing_api_headers.get("content-type", "").startswith("application/json")
                    and b"<html" not in missing_api_body.lower(),
                    "Missing API routes must retain API 404 behavior",
                )
                _assert(
                    traversal_status == 404 and b"FastAPI" not in traversal_body,
                    "Static path traversal was not rejected",
                )

                print(
                    "PASS: build, assets, deep links, API, origin and path checks"
                )
        except (URLError, OSError) as exc:
            raise RuntimeError(f"Local distribution smoke request failed: {exc}") from exc
        finally:
            if server is not None and server.poll() is None:
                server.terminate()
                try:
                    server.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    server.kill()
                    server.wait(timeout=5)

        connection = sqlite3.connect(database_path)
        try:
            workspace_count = connection.execute(
                "SELECT count(*) FROM workspaces WHERE name = ?", ("PLT-01 Smoke Workspace",)
            ).fetchone()[0]
            project_count = connection.execute(
                "SELECT count(*) FROM projects WHERE name = ?", ("PLT-01 Smoke Project",)
            ).fetchone()[0]
        finally:
            connection.close()
        _assert(
            workspace_count == 1 and project_count == 1,
            "Smoke data was not persisted in the isolated SQLite database",
        )
        print("PASS: isolated SQLite contains the persisted Workspace and Project")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
