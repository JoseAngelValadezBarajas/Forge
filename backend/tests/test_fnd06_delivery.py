import copy
import html
import json
from collections.abc import Iterator
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.application.delivery import manifest_completeness_errors
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


def _candidate(
    client: TestClient,
    base: str,
    *,
    feature_ids: list[str],
    context_package_ids: list[str],
    evidence_ids: list[str],
    verification_ids: list[str],
    handoff_revision_ids: list[str] | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    response = client.post(
        f"{base}/release-candidates",
        json={
            "title": "Scoped release candidate",
            "feature_ids": feature_ids,
            "context_package_ids": context_package_ids,
            "evidence_ids": evidence_ids,
            "verification_ids": verification_ids,
            "handoff_revision_ids": handoff_revision_ids or [],
        },
    )
    assert response.status_code == 201, response.text
    candidate = response.json()
    frozen = client.post(
        f"{base}/release-candidates/{candidate['id']}/freeze",
        json={"expected_revision": candidate["revision"]},
    )
    assert frozen.status_code == 200, frozen.text
    return candidate, frozen.json()


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
    other_feature = client.post(
        f"{base}/features", json={"title": "Unrelated Feature", "goal": "Other subject"}
    ).json()
    mismatched_subject = client.post(
        f"{base}/verifications/preview",
        json={
            "rule_id": "V03",
            "handoff_revision_id": revision_id,
            "feature_id": other_feature["id"],
        },
    )
    assert mismatched_subject.status_code in {400, 422}
    result = client.post(
        f"{base}/verifications/preview",
        json={"rule_id": "V03", "handoff_revision_id": revision_id},
    )
    assert result.status_code == 200
    assert result.json()["result"] == "PASS"
    saved_v03 = client.post(
        f"{base}/verifications/evaluate",
        json={"rule_id": "V03", "handoff_revision_id": revision_id},
    ).json()
    saved_v02 = client.post(
        f"{base}/verifications/evaluate",
        json={"rule_id": "V02", "context_package_id": package_id},
    ).json()
    _, candidate = _candidate(
        client,
        base,
        feature_ids=[feature_id],
        context_package_ids=[package_id],
        evidence_ids=[],
        verification_ids=[saved_v02["id"], saved_v03["id"]],
        handoff_revision_ids=[revision_id],
    )
    gate = client.post(f"{base}/release-candidates/{candidate['id']}/gates/preview").json()
    assert next(check for check in gate["checks"] if check["rule_id"] == "G04")["status"] == "PASS"
    _close(fixture)


def test_project_level_evidence_cannot_be_assigned_to_foreign_features() -> None:
    fixture = _fixture()
    client, workspace_id, project_id, feature_id, _criterion_id, package_id, _ = fixture
    base = f"/api/workspaces/{workspace_id}/projects/{project_id}"
    project_evidence = client.post(
        f"{base}/evidence",
        json={
            "evidence_type": "manual_attestation",
            "title": "Project-level declaration",
            "description": "No Feature is asserted.",
            "source_kind": "manual",
        },
    )
    assert project_evidence.status_code == 201, project_evidence.text
    evidence_id = project_evidence.json()["id"]

    valid = client.post(
        f"{base}/verifications/evaluate",
        json={"rule_id": "V04", "evidence_ids": [evidence_id]},
    )
    assert valid.status_code == 201, valid.text
    assert valid.json()["result"] == "PASS"
    assert valid.json()["feature_id"] is None
    assert valid.json()["subject"]["feature_id"] is None

    same_workspace_project = client.post(
        f"/api/workspaces/{workspace_id}/projects", json={"name": "Other Project"}
    ).json()
    same_workspace_feature = client.post(
        f"/api/workspaces/{workspace_id}/projects/{same_workspace_project['id']}/features",
        json={"title": "Foreign project Feature", "goal": "Not in the subject Project"},
    ).json()
    other_workspace = client.post("/api/workspaces", json={"name": "Foreign Workspace"}).json()
    foreign_project = client.post(
        f"/api/workspaces/{other_workspace['id']}/projects", json={"name": "Foreign Project"}
    ).json()
    foreign_feature = client.post(
        f"/api/workspaces/{other_workspace['id']}/projects/{foreign_project['id']}/features",
        json={"title": "Foreign workspace Feature", "goal": "Not accessible here"},
    ).json()
    foreign_evidence = client.post(
        f"/api/workspaces/{other_workspace['id']}/projects/{foreign_project['id']}/evidence",
        json={
            "evidence_type": "manual_attestation",
            "title": "Foreign project declaration",
            "source_kind": "manual",
        },
    ).json()
    foreign_verification = client.post(
        f"/api/workspaces/{other_workspace['id']}/projects/{foreign_project['id']}/verifications/evaluate",
        json={"rule_id": "V04", "evidence_ids": [foreign_evidence["id"]]},
    ).json()

    for feature_id in (same_workspace_feature["id"], foreign_feature["id"]):
        rejected = client.post(
            f"{base}/verifications/preview",
            json={"rule_id": "V04", "evidence_ids": [evidence_id], "feature_id": feature_id},
        )
        assert rejected.status_code in {400, 422}

    package_mismatch = client.post(
        f"{base}/verifications/preview",
        json={
            "rule_id": "V02",
            "context_package_id": package_id,
            "feature_id": same_workspace_feature["id"],
        },
    )
    assert package_mismatch.status_code in {400, 422}
    cross_workspace_candidate = client.post(
        f"{base}/release-candidates",
        json={
            "title": "Cross-workspace attempt",
            "feature_ids": [feature_id],
            "context_package_ids": [package_id],
            "evidence_ids": [],
            "verification_ids": [foreign_verification["id"]],
        },
    )
    assert cross_workspace_candidate.status_code in {400, 422}
    saved = client.get(f"{base}/verifications").json()
    assert [item["id"] for item in saved] == [valid.json()["id"]]
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
    embedded = download.text.split("<pre><code>\n", maxsplit=1)[1].split(
        "\n</code></pre>", maxsplit=1
    )[0]
    assert json.loads(html.unescape(embedded)) == manifest["payload"]
    assert (
        client.get(f"{base}/release-candidates/{candidate['id']}").json()["snapshot"]
        == frozen.json()["snapshot"]
    )
    assert client.post(f"{base}/archive").status_code == 200
    assert client.get(f"{base}/release-candidates/{candidate['id']}").status_code == 200
    assert (
        client.post(f"{base}/release-candidates/{candidate['id']}/gates/preview").status_code == 200
    )
    assert client.post(
        f"{base}/release-candidates/{candidate['id']}/gates/evaluate"
    ).status_code in {400, 422}
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


def test_g04_rejects_project_level_or_unrelated_passing_checks() -> None:
    fixture = _fixture()
    client, workspace_id, project_id, feature_id, criterion_id, package_id, _ = fixture
    base = f"/api/workspaces/{workspace_id}/projects/{project_id}"

    project_evidence = client.post(
        f"{base}/evidence",
        json={
            "evidence_type": "manual_attestation",
            "title": "Project-level note",
            "source_kind": "manual",
        },
    ).json()
    project_v04 = client.post(
        f"{base}/verifications/evaluate",
        json={"rule_id": "V04", "evidence_ids": [project_evidence["id"]]},
    ).json()
    _, project_only_candidate = _candidate(
        client,
        base,
        feature_ids=[feature_id],
        context_package_ids=[package_id],
        evidence_ids=[project_evidence["id"]],
        verification_ids=[project_v04["id"]],
    )
    project_only_gate = client.post(
        f"{base}/release-candidates/{project_only_candidate['id']}/gates/preview"
    ).json()
    project_only_g04 = next(
        check for check in project_only_gate["checks"] if check["rule_id"] == "G04"
    )
    assert project_v04["result"] == "PASS"
    assert project_v04["feature_id"] is None
    assert project_only_g04["status"] == "BLOCKED"
    assert any("V02" in blocker for blocker in project_only_g04["blockers"])

    linked_evidence = client.post(
        f"{base}/evidence",
        json={
            "feature_id": feature_id,
            "acceptance_criterion_id": criterion_id,
            "evidence_type": "reported_test_result",
            "title": "Criterion evidence",
            "source_kind": "manual",
        },
    ).json()
    v04 = client.post(
        f"{base}/verifications/evaluate",
        json={"rule_id": "V04", "evidence_ids": [linked_evidence["id"]]},
    ).json()
    task = client.post(
        f"{base}/features/{feature_id}/tasks", json={"title": "Change Context Package input"}
    )
    assert task.status_code == 201
    other_package = client.post(f"{base}/features/{feature_id}/context/packages").json()
    assert other_package["id"] != package_id
    unrelated_v02 = client.post(
        f"{base}/verifications/evaluate",
        json={"rule_id": "V02", "context_package_id": other_package["id"]},
    ).json()
    _, wrong_package_candidate = _candidate(
        client,
        base,
        feature_ids=[feature_id],
        context_package_ids=[package_id],
        evidence_ids=[linked_evidence["id"]],
        verification_ids=[v04["id"], unrelated_v02["id"]],
    )
    wrong_package_gate = client.post(
        f"{base}/release-candidates/{wrong_package_candidate['id']}/gates/preview"
    ).json()
    wrong_package_g04 = next(
        check for check in wrong_package_gate["checks"] if check["rule_id"] == "G04"
    )
    assert unrelated_v02["result"] == "PASS"
    assert wrong_package_g04["status"] == "BLOCKED"
    assert any("does not verify a selected" in blocker for blocker in wrong_package_g04["blockers"])
    assert any("Required V02" in blocker for blocker in wrong_package_g04["blockers"])

    unrelated_evidence = client.post(
        f"{base}/evidence",
        json={
            "feature_id": feature_id,
            "acceptance_criterion_id": criterion_id,
            "evidence_type": "reported_test_result",
            "title": "Other Evidence input",
            "source_kind": "manual",
        },
    ).json()
    unrelated_v04 = client.post(
        f"{base}/verifications/evaluate",
        json={"rule_id": "V04", "evidence_ids": [unrelated_evidence["id"]]},
    ).json()
    _, unrelated_candidate = _candidate(
        client,
        base,
        feature_ids=[feature_id],
        context_package_ids=[package_id],
        evidence_ids=[linked_evidence["id"]],
        verification_ids=[unrelated_v04["id"]],
    )
    unrelated_gate = client.post(
        f"{base}/release-candidates/{unrelated_candidate['id']}/gates/preview"
    ).json()
    unrelated_g04 = next(check for check in unrelated_gate["checks"] if check["rule_id"] == "G04")
    assert unrelated_v04["result"] == "PASS"
    assert unrelated_g04["status"] == "BLOCKED"
    assert any("does not verify a selected" in blocker for blocker in unrelated_g04["blockers"])
    assert any("Required V02" in blocker for blocker in unrelated_g04["blockers"])

    required_v02 = client.post(
        f"{base}/verifications/evaluate",
        json={"rule_id": "V02", "context_package_id": package_id},
    ).json()
    _, complete_candidate = _candidate(
        client,
        base,
        feature_ids=[feature_id],
        context_package_ids=[package_id],
        evidence_ids=[linked_evidence["id"]],
        verification_ids=[v04["id"], required_v02["id"]],
    )
    complete_gate = client.post(
        f"{base}/release-candidates/{complete_candidate['id']}/gates/preview"
    ).json()
    assert complete_gate["result"] == "READY_BY_DEFINED_GATES"
    assert (
        next(check for check in complete_gate["checks"] if check["rule_id"] == "G04")["status"]
        == "PASS"
    )
    assert (
        next(check for check in complete_gate["checks"] if check["rule_id"] == "G06")["status"]
        == "PASS"
    )
    assert manifest_completeness_errors(complete_gate["manifest"]) == []
    inconsistent_verification = copy.deepcopy(complete_gate["manifest"])
    selected_v02 = next(
        row
        for row in inconsistent_verification["verification_evaluations"]
        if row["rule_id"] == "V02"
    )
    selected_v02["inputs"]["context_package_id"] = "unselected-package"
    assert manifest_completeness_errors(inconsistent_verification)
    unsupported_version = copy.deepcopy(complete_gate["manifest"])
    unsupported_version["verification_evaluations"][0]["rule_version"] = "99.0"
    assert manifest_completeness_errors(unsupported_version)

    artifact_evidence = client.post(
        f"{base}/evidence",
        json={
            "feature_id": feature_id,
            "acceptance_criterion_id": criterion_id,
            "evidence_type": "artifact_reference",
            "title": "Declared artifact bytes",
            "source_kind": "manual",
        },
    )
    assert artifact_evidence.status_code == 201, artifact_evidence.text
    artifact_v04 = client.post(
        f"{base}/verifications/evaluate",
        json={"rule_id": "V04", "evidence_ids": [artifact_evidence.json()["id"]]},
    ).json()
    _, artifact_candidate = _candidate(
        client,
        base,
        feature_ids=[feature_id],
        context_package_ids=[package_id],
        evidence_ids=[artifact_evidence.json()["id"]],
        verification_ids=[required_v02["id"], artifact_v04["id"]],
    )
    artifact_gate = client.post(
        f"{base}/release-candidates/{artifact_candidate['id']}/gates/preview"
    ).json()
    artifact_g04 = next(check for check in artifact_gate["checks"] if check["rule_id"] == "G04")
    assert artifact_v04["result"] == "PASS"
    assert artifact_g04["status"] == "BLOCKED"
    assert any("V01 is required" in blocker for blocker in artifact_g04["blockers"])
    _close(fixture)


def test_stale_v04_cannot_satisfy_g04_and_historical_gate_is_immutable() -> None:
    fixture = _fixture()
    client, workspace_id, project_id, feature_id, criterion_id, package_id, _ = fixture
    base = f"/api/workspaces/{workspace_id}/projects/{project_id}"
    evidence = client.post(
        f"{base}/evidence",
        json={
            "feature_id": feature_id,
            "acceptance_criterion_id": criterion_id,
            "evidence_type": "reported_test_result",
            "title": "Evidence to invalidate",
            "source_kind": "manual",
        },
    ).json()
    v02 = client.post(
        f"{base}/verifications/evaluate",
        json={"rule_id": "V02", "context_package_id": package_id},
    ).json()
    v04 = client.post(
        f"{base}/verifications/evaluate",
        json={"rule_id": "V04", "evidence_ids": [evidence["id"]]},
    ).json()
    candidate, _ = _candidate(
        client,
        base,
        feature_ids=[feature_id],
        context_package_ids=[package_id],
        evidence_ids=[evidence["id"]],
        verification_ids=[v02["id"], v04["id"]],
    )
    candidate_id = candidate["id"]
    saved_gate = client.post(f"{base}/release-candidates/{candidate_id}/gates/evaluate")
    assert saved_gate.status_code == 201
    assert saved_gate.json()["result"] == "READY_BY_DEFINED_GATES"
    historical_checks = copy.deepcopy(saved_gate.json()["checks"])

    invalidated = client.post(f"{base}/evidence/{evidence['id']}/invalidate")
    assert invalidated.status_code == 200
    verification_after = client.get(f"{base}/verifications/{v04['id']}").json()
    assert verification_after["result"] == "PASS"
    assert verification_after["stale"] is True
    preview = client.post(f"{base}/release-candidates/{candidate_id}/gates/preview").json()
    assert preview["result"] == "STALE"
    g04 = next(check for check in preview["checks"] if check["rule_id"] == "G04")
    assert g04["status"] == "STALE"
    history = client.get(f"{base}/release-candidates/{candidate_id}/gates").json()
    historical = next(row for row in history if row["id"] == saved_gate.json()["id"])
    assert historical["stored_result"] == "READY_BY_DEFINED_GATES"
    assert historical["result"] == "STALE"
    assert historical["checks"] == historical_checks
    _close(fixture)


def test_acceptance_criteria_are_frozen_scoped_and_drive_gate_freshness() -> None:
    fixture = _fixture()
    client, workspace_id, project_id, feature_a, criterion_a, package_a, _ = fixture
    base = f"/api/workspaces/{workspace_id}/projects/{project_id}"
    feature_b = client.post(
        f"{base}/features", json={"title": "Second selected Feature", "goal": "Ship safely"}
    ).json()
    criterion_b = client.post(
        f"{base}/features/{feature_b['id']}/acceptance-criteria",
        json={"description": "Second Feature has evidence"},
    ).json()
    package_b = client.post(f"{base}/features/{feature_b['id']}/context/packages").json()
    evidence_a = client.post(
        f"{base}/evidence",
        json={
            "feature_id": feature_a,
            "acceptance_criterion_id": criterion_a,
            "evidence_type": "reported_test_result",
            "title": "Feature A evidence",
            "source_kind": "manual",
        },
    ).json()
    evidence_b = client.post(
        f"{base}/evidence",
        json={
            "feature_id": feature_b["id"],
            "acceptance_criterion_id": criterion_b["id"],
            "evidence_type": "reported_test_result",
            "title": "Feature B evidence",
            "source_kind": "manual",
        },
    ).json()
    v02_a = client.post(
        f"{base}/verifications/evaluate",
        json={"rule_id": "V02", "context_package_id": package_a},
    ).json()
    v02_b = client.post(
        f"{base}/verifications/evaluate",
        json={"rule_id": "V02", "context_package_id": package_b["id"]},
    ).json()
    v04 = client.post(
        f"{base}/verifications/evaluate",
        json={
            "rule_id": "V04",
            "evidence_ids": [evidence_a["id"], evidence_b["id"]],
        },
    ).json()
    candidate, frozen = _candidate(
        client,
        base,
        feature_ids=[feature_a, feature_b["id"]],
        context_package_ids=[package_a, package_b["id"]],
        evidence_ids=[evidence_a["id"], evidence_b["id"]],
        verification_ids=[v02_a["id"], v02_b["id"], v04["id"]],
    )
    frozen_criteria = frozen["snapshot"]["acceptance_criteria"]
    assert {row["id"] for row in frozen_criteria} == {criterion_a, criterion_b["id"]}
    assert all(row["feature_id"] in {feature_a, feature_b["id"]} for row in frozen_criteria)
    candidate_id = candidate["id"]
    ready = client.post(f"{base}/release-candidates/{candidate_id}/gates/evaluate").json()
    assert ready["result"] == "READY_BY_DEFINED_GATES"

    unrelated_feature = client.post(
        f"{base}/features", json={"title": "Outside candidate", "goal": "Unrelated"}
    ).json()
    client.post(
        f"{base}/features/{unrelated_feature['id']}/acceptance-criteria",
        json={"description": "Outside selected scope"},
    )
    still_ready = client.post(f"{base}/release-candidates/{candidate_id}/gates/preview").json()
    assert still_ready["result"] == "READY_BY_DEFINED_GATES"
    assert still_ready["input_fingerprint"] == ready["input_fingerprint"]

    added = client.post(
        f"{base}/features/{feature_b['id']}/acceptance-criteria",
        json={"description": "Added after freeze"},
    )
    assert added.status_code == 201
    stale_preview = client.post(f"{base}/release-candidates/{candidate_id}/gates/preview").json()
    assert stale_preview["result"] == "STALE"
    assert (
        next(check for check in stale_preview["checks"] if check["rule_id"] == "G03")["status"]
        == "PASS"
    )  # G03 uses the frozen criteria set.
    assert (
        next(check for check in stale_preview["checks"] if check["rule_id"] == "G05")["status"]
        == "STALE"
    )

    old_history = client.get(f"{base}/release-candidates/{candidate_id}/gates").json()
    old_ready = next(row for row in old_history if row["id"] == ready["id"])
    assert old_ready["stored_result"] == "READY_BY_DEFINED_GATES"
    assert old_ready["result"] == "STALE"
    assert old_ready["checks"] == ready["checks"]
    reevaluated = client.post(f"{base}/release-candidates/{candidate_id}/gates/evaluate").json()
    assert reevaluated["id"] != ready["id"]
    assert reevaluated["result"] == "STALE"
    assert reevaluated["input_fingerprint"] != ready["input_fingerprint"]
    current_candidate = client.get(f"{base}/release-candidates/{candidate_id}").json()
    assert current_candidate["snapshot"] == frozen["snapshot"]
    _close(fixture)


def test_manifest_completeness_is_schema_aware_and_non_circular() -> None:
    fixture = _fixture()
    client, workspace_id, project_id, feature_id, _criterion_id, package_id, _ = fixture
    base = f"/api/workspaces/{workspace_id}/projects/{project_id}"
    candidate, _ = _candidate(
        client,
        base,
        feature_ids=[feature_id],
        context_package_ids=[package_id],
        evidence_ids=[],
        verification_ids=[],
    )
    preview = client.post(f"{base}/release-candidates/{candidate['id']}/gates/preview").json()
    manifest = preview["manifest"]
    assert preview["result"] == "BLOCKED"
    assert (
        next(check for check in preview["checks"] if check["rule_id"] == "G06")["status"] == "PASS"
    )
    assert manifest_completeness_errors(manifest) == []

    invalid_manifests = []
    wrong_schema = copy.deepcopy(manifest)
    wrong_schema["schema"] = "unknown-schema"
    invalid_manifests.append(wrong_schema)
    missing_context = copy.deepcopy(manifest)
    missing_context["context_packages"] = []
    invalid_manifests.append(missing_context)
    foreign_project = copy.deepcopy(manifest)
    foreign_project["project_id"] = "foreign-project"
    invalid_manifests.append(foreign_project)
    missing_integrity = copy.deepcopy(manifest)
    missing_integrity["integrity"]["candidate_snapshot_fingerprint"] = None
    invalid_manifests.append(missing_integrity)
    wrong_gate_inputs = copy.deepcopy(manifest)
    next(
        check
        for check in wrong_gate_inputs["gate_evaluation"]["checks"]
        if check["rule_id"] == "G02"
    )["inputs"] = []
    invalid_manifests.append(wrong_gate_inputs)
    published = copy.deepcopy(manifest)
    published["publication_status"] = "PUBLISHED"
    invalid_manifests.append(published)
    for incomplete in invalid_manifests:
        assert manifest_completeness_errors(incomplete)

    malformed_reference = copy.deepcopy(manifest)
    malformed_reference["scope"]["context_package_ids"] = [{"not": "an id"}]
    assert manifest_completeness_errors(malformed_reference)
    _close(fixture)
