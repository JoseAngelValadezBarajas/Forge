from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import Settings
from app.db import Base, get_db
from app.local_runtime import local_runtime_origin
from app.main import create_app


@pytest.fixture
def frontend_dist(tmp_path: Path) -> Path:
    dist = tmp_path / "dist"
    assets = dist / "assets"
    assets.mkdir(parents=True)
    (assets / "app.js").write_text("console.info('built');", encoding="utf-8")
    (assets / "app.css").write_text("body { color: black; }", encoding="utf-8")
    (dist / "index.html").write_text(
        '<!doctype html><html><head><link rel="stylesheet" href="/assets/app.css">'
        '</head><body><div id="root"></div><script type="module" '
        'src="/assets/app.js"></script></body></html>',
        encoding="utf-8",
    )
    return dist


def _local_app(dist: Path, port: int = 43123) -> tuple[FastAPI, Settings]:
    settings = Settings(
        _env_file=None,  # type: ignore[call-arg]
        runtime_mode="local",
        runtime_host="127.0.0.1",
        runtime_port=port,
        frontend_dist_dir=dist,
    )
    return create_app(settings), settings


@contextmanager
def _isolated_database(application: FastAPI) -> Iterator[None]:
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


def test_local_runtime_serves_only_build_assets_and_browser_navigation(
    frontend_dist: Path,
) -> None:
    application, _ = _local_app(frontend_dist)
    with TestClient(application) as client:
        navigation_headers = {
            "Accept": "text/html,application/xhtml+xml",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Dest": "document",
        }
        root = client.get("/", headers=navigation_headers)
        deep_link = client.get("/projects/p1/features/f1", headers=navigation_headers)
        assert root.status_code == deep_link.status_code == 200
        assert root.headers["content-type"].startswith("text/html")
        assert "/src/main.tsx" not in root.text
        assert deep_link.text == root.text

        javascript = client.get("/assets/app.js")
        stylesheet = client.get("/assets/app.css")
        assert javascript.status_code == 200
        assert javascript.headers["content-type"].startswith("text/javascript") or (
            javascript.headers["content-type"].startswith("application/javascript")
        )
        assert stylesheet.status_code == 200
        assert stylesheet.headers["content-type"].startswith("text/css")

        missing_asset = client.get("/assets/missing.js", headers=navigation_headers)
        missing_api = client.get("/api/not-a-route", headers=navigation_headers)
        traversal = client.get("/assets/%2e%2e%2f..%2fbackend%2fapp%2fmain.py")
        source_path = client.get("/backend/app/main.py", headers=navigation_headers)
        assert missing_asset.status_code == 404
        assert "<html" not in missing_asset.text.lower()
        assert missing_api.status_code == 404
        assert missing_api.headers["content-type"].startswith("application/json")
        assert "<html" not in missing_api.text.lower()
        assert traversal.status_code == 404
        assert source_path.status_code == 404

        non_navigation = client.get("/projects/p1", headers={"Accept": "text/html"})
        assert non_navigation.status_code == 404


def test_local_runtime_requires_the_configured_origin_not_host_header(
    frontend_dist: Path,
) -> None:
    application, settings = _local_app(frontend_dist)
    with _isolated_database(application), TestClient(application) as client:
        payload = {"name": "Origin policy workspace"}
        spoofed = client.post(
            "/api/workspaces",
            json=payload,
            headers={"Origin": "http://attacker.invalid", "Host": "attacker.invalid"},
        )
        missing_origin = client.post("/api/workspaces", json=payload)
        accepted = client.post(
            "/api/workspaces",
            json=payload,
            headers={"Origin": local_runtime_origin(settings)},
        )

        assert spoofed.status_code == 403
        assert missing_origin.status_code == 403
        assert accepted.status_code == 201


def test_development_mode_keeps_its_existing_frontend_origin_allowlist(
    frontend_dist: Path,
) -> None:
    settings = Settings(
        _env_file=None,  # type: ignore[call-arg]
        runtime_mode="development",
        frontend_origin="http://localhost:5173",
        frontend_dist_dir=frontend_dist,
    )
    application = create_app(settings)
    with _isolated_database(application), TestClient(application) as client:
        local_alias = client.post(
            "/api/workspaces",
            json={"name": "Development origin workspace"},
            headers={"Origin": "http://127.0.0.1:5173"},
        )
        forbidden = client.post(
            "/api/workspaces",
            json={"name": "Forbidden origin workspace"},
            headers={"Origin": "https://attacker.invalid"},
        )

        assert local_alias.status_code == 201
        assert forbidden.status_code == 403


@pytest.mark.parametrize("host", ["0.0.0.0", "192.0.2.10", "localhost"])
def test_local_runtime_fails_closed_for_non_literal_loopback_hosts(
    frontend_dist: Path, host: str
) -> None:
    settings = Settings(
        _env_file=None,  # type: ignore[call-arg]
        runtime_mode="local",
        runtime_host=host,
        frontend_dist_dir=frontend_dist,
    )

    with pytest.raises(RuntimeError, match="loopback IP address"):
        create_app(settings)


def test_local_runtime_origin_uses_browser_canonical_default_http_port(
    frontend_dist: Path,
) -> None:
    settings = Settings(
        _env_file=None,  # type: ignore[call-arg]
        runtime_mode="local",
        runtime_host="127.0.0.1",
        runtime_port=80,
        frontend_dist_dir=frontend_dist,
    )

    assert local_runtime_origin(settings) == "http://127.0.0.1"


def test_local_runtime_startup_fails_when_a_compiled_asset_is_missing(tmp_path: Path) -> None:
    dist = tmp_path / "broken-dist"
    assets = dist / "assets"
    assets.mkdir(parents=True)
    (assets / "app.css").write_text("body {}", encoding="utf-8")
    (dist / "index.html").write_text(
        '<link rel="stylesheet" href="/assets/app.css">'
        '<script type="module" src="/assets/missing.js"></script>',
        encoding="utf-8",
    )
    application, _ = _local_app(dist)

    with pytest.raises(RuntimeError, match="Frontend build asset is missing"):
        with TestClient(application):
            pass
