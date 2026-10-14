from collections.abc import Iterator

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.domain.verification import VerificationEngine
from app.main import app


def _fixture() -> tuple[TestClient, str, str, str, str, str, object]:
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    def override_db() -> Iterator[Session]:
        with sessions() as session:
            yield session

    app.dependency_overrides[get_db] = override_db
    client = TestClient(app)
    workspace = client.post("/api/workspaces", json={"name": "FND-06"}).json()
    project = client.post(
        f"/api/workspaces/{workspace['id']}/projects", json={"name": "Delivery"}
    ).json()
    feature = client.post(
        f"/api/workspaces/{workspace['id']}/projects/{project['id']}/features",
        json={"title": "Evidence flow", "goal": "Preserve evidence"},
    ).json()
    criterion = client.post(
        f"/api/workspaces/{workspace['id']}/projects/{project['id']}/features/{feature['id']}/acceptance-criteria",
        json={"description": "A documented criterion"},
    ).json()
    package = client.post(
        f"/api/workspaces/{workspace['id']}/projects/{project['id']}/features/{feature['id']}/context/packages"
    ).json()
    return (
        client,
        workspace["id"],
        project["id"],
        feature["id"],
        criterion["id"],
        package["id"],
        engine,
    )


def _close(fixture: tuple[TestClient, str, str, str, str, str, object]) -> None:
    client, *_ids, engine = fixture
    client.close()
    app.dependency_overrides.clear()
    engine.dispose()  # type: ignore[attr-defined]


def test_verification_engine_is_pure_and_fingerprints_canonical_inputs() -> None:
    engine = VerificationEngine()
    left = engine.input_fingerprint(
        ruleset="rules-v1",
        rule_id="V02",
        rule_version="1.0",
        subject={"project_id": "p", "feature_id": "f"},
        inputs={"digest": "a" * 64, "package_id": "pkg"},
    )
    right = engine.input_fingerprint(
        ruleset="rules-v1",
        rule_id="V02",
        rule_version="1.0",
        subject={"feature_id": "f", "project_id": "p"},
        inputs={"package_id": "pkg", "digest": "a" * 64},
    )
    assert left == right
    payload = {"title": "Revisión con ñandú", "revision": 1}
    fingerprint = engine.handoff_revision_digest(payload)
    actual, identity_ok, valid = engine.handoff_integrity(
        payload, fingerprint, {"title": "Revisión con ñandú", "revision": 1}
    )
    assert actual == fingerprint
    assert identity_ok and valid


def test_evidence_is_reported_safe_and_project_scoped() -> None:
    fixture = _fixture()
    client, workspace_id, project_id, feature_id, criterion_id, _package_id, _ = fixture
    base = f"/api/workspaces/{workspace_id}/projects/{project_id}"
    payload = {
        "feature_id": feature_id,
        "acceptance_criterion_id": criterion_id,
        "evidence_type": "reported_test_result",
        "title": "Test report link",
        "description": "Declared by a user",
        "source_kind": "safe_link",
        "source_reference": "https://example.test/results/123",
        "declared_outcome": "PASS",
    }
    response = client.post(f"{base}/evidence", json=payload)
    assert response.status_code == 201
    evidence = response.json()
    assert evidence["provenance"] == "REPORTED"
    assert evidence["status"] == "ACTIVE"

    for unsafe in (
        "file:///C:/Users/private/report.txt",
        "javascript:alert(1)",
        "https://user:pass@example.test/",
        "C:\\private\\report.txt",
    ):
        invalid = client.post(f"{base}/evidence", json={**payload, "source_reference": unsafe})
        assert invalid.status_code in {400, 422}

    other_workspace = client.post("/api/workspaces", json={"name": "Other"}).json()
    other_project = client.post(
        f"/api/workspaces/{other_workspace['id']}/projects", json={"name": "Other"}
    ).json()
    foreign = client.post(
        f"/api/workspaces/{other_workspace['id']}/projects/{other_project['id']}/evidence",
        json=payload,
    )
    assert foreign.status_code in {400, 404, 422}
    assert client.get(f"{base}/evidence/{evidence['id']}").json()["id"] == evidence["id"]
    _close(fixture)


def test_context_verification_is_deterministic_historical_and_stale() -> None:
    fixture = _fixture()
    client, workspace_id, project_id, feature_id, _criterion_id, package_id, _ = fixture
    base = f"/api/workspaces/{workspace_id}/projects/{project_id}"
    request = {"rule_id": "V02", "feature_id": feature_id, "context_package_id": package_id}
    preview_a = client.post(f"{base}/verifications/preview", json=request).json()
    preview_b = client.post(f"{base}/verifications/preview", json=request).json()
    assert preview_a["input_fingerprint"] == preview_b["input_fingerprint"]
    assert preview_a["result"] == "PASS"
    saved = client.post(f"{base}/verifications/evaluate", json=request).json()
    assert saved["id"]
    assert saved["result"] == "PASS"
    assert client.get(f"{base}/verifications/{saved['id']}").json()["stale"] is False

    changed = client.post(
        f"{base}/features/{feature_id}/acceptance-criteria",
        json={"description": "Changed scope"},
    )
    assert changed.status_code == 201
    historical = client.get(f"{base}/verifications/{saved['id']}").json()
    assert historical["id"] == saved["id"]
    assert historical["stale"] is False  # V02 is pinned to the package, not live criteria.

    unsupported = client.post(
        f"{base}/verifications/preview", json={"rule_id": "V01", "expected_digest": "0" * 64}
    )
    assert unsupported.status_code == 200
    assert unsupported.json()["result"] == "BLOCKED"
    _close(fixture)


def test_handoff_revision_integrity_uses_its_unicode_canonicalization() -> None:
    fixture = _fixture()
    client, workspace_id, project_id, feature_id, _criterion_id, package_id, _ = fixture
    base = f"/api/workspaces/{workspace_id}/projects/{project_id}"
    run = client.post(
        f"{base}/runs",
        json={"feature_id": feature_id, "context_package_id": package_id, "title": "Unicode run"},
    ).json()
    handoff = client.post(
        f"{base}/runs/{run['id']}/handoffs",
        json={
            "title": "Revisión con ñandú",
            "summary": "A résumé with café details",
            "next_actions": "Revisar cambios",
        },
    )
    assert handoff.status_code == 201
    ready = client.post(
        f"{base}/handoffs/{handoff.json()['id']}/ready", json={"expected_version": 1}
    )
    assert ready.status_code == 200
    revision = ready.json()["current_revision"]
    revisions = client.get(f"{base}/handoffs/{handoff.json()['id']}/revisions").json()
    revision_id = next(item["id"] for item in revisions if item["revision"] == revision)
    result = client.post(
        f"{base}/verifications/preview",
        json={"rule_id": "V03", "handoff_revision_id": revision_id},
    )
    assert result.status_code == 200
    assert result.json()["result"] == "PASS"
    _close(fixture)


def test_candidate_freeze_gate_and_manifest_are_persistent_and_safe() -> None:
    fixture = _fixture()
    client, workspace_id, project_id, feature_id, criterion_id, package_id, _ = fixture
    base = f"/api/workspaces/{workspace_id}/projects/{project_id}"
    evidence = client.post(
        f"{base}/evidence",
        json={
            "feature_id": feature_id,
            "acceptance_criterion_id": criterion_id,
            "evidence_type": "manual_attestation",
            "title": "Declared <script>content</script> C:\\private\\home",
            "description": "C:\\private\\home",
            "source_kind": "manual",
        },
    ).json()
    candidate_response = client.post(
        f"{base}/release-candidates",
        json={
            "title": "Candidate alpha",
            "feature_ids": [feature_id],
            "context_package_ids": [package_id],
            "evidence_ids": [evidence["id"]],
        },
    )
    assert candidate_response.status_code == 201
    candidate = candidate_response.json()
    frozen = client.post(
        f"{base}/release-candidates/{candidate['id']}/freeze", json={"expected_revision": 1}
    )
    assert frozen.status_code == 200
    gate = client.post(f"{base}/release-candidates/{candidate['id']}/gates/evaluate")
    assert gate.status_code == 201
    assert gate.json()["result"] == "BLOCKED"
    assert {check["rule_id"] for check in gate.json()["checks"]} == {
        "G01",
        "G02",
        "G03",
        "G04",
        "G05",
        "G06",
    }
    saved = client.post(
        f"{base}/release-candidates/{candidate['id']}/manifest",
        json={"gate_evaluation_id": gate.json()["id"]},
    )
    assert saved.status_code == 201
    manifest = saved.json()
    assert manifest["payload"]["publication_status"] == "NOT_PUBLISHED"
    serialized = str(manifest["payload"])
    assert "private" not in serialized
    assert "<script>" in serialized  # JSON preserves the user's data as data.
    download = client.get(
        f"{base}/release-candidates/{candidate['id']}/manifest/download?format=markdown"
    )
    assert download.status_code == 200
    assert "&lt;script&gt;" in download.text
    assert "```" not in download.text
    assert (
        client.get(f"{base}/release-candidates/{candidate['id']}").json()["snapshot"]
        == frozen.json()["snapshot"]
    )
    assert client.post(f"{base}/archive").status_code == 200
    blocked = client.post(
        f"{base}/evidence",
        json={
            "evidence_type": "manual_attestation",
            "title": "Must not persist",
            "source_kind": "manual",
        },
    )
    assert blocked.status_code in {400, 422}
    _close(fixture)
