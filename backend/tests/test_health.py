from fastapi.testclient import TestClient

from app.main import app


def test_health_returns_service_status() -> None:
    with TestClient(app) as client:
        response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["service"] == "Forge"

