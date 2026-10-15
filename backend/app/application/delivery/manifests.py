"""Schema-aware manifest validation, persistence and Markdown export."""

from __future__ import annotations

import html
import json
from typing import Any
from uuid import uuid4

from sqlalchemy import select

from app.application.services import EntityNotFound
from app.domain.verification import VerificationEngine
from app.persistence.models import (
    ReleaseGateEvaluationModel,
    ReleaseManifestModel,
)

from .base import DeliveryContext, DeliveryServiceBase, utc_now
from .candidates import CandidateService
from .constants import (
    CANDIDATE_SCHEMA,
    MANIFEST_SCHEMA,
    RELEASE_RULESET,
    VERIFICATION_RULESET,
)
from .serialization import _json, canonical_json, digest
from .validation import _is_sha256


def manifest_completeness_errors(manifest: dict[str, Any]) -> list[str]:
    """Validate manifest structure and references without relying on its own digest."""
    errors: list[str] = []
    scope = manifest.get("scope")
    candidate = manifest.get("candidate")
    project = manifest.get("project")
    if manifest.get("schema") != MANIFEST_SCHEMA:
        errors.append("Unsupported or missing manifest schema.")
    project_id = manifest.get("project_id")
    if not isinstance(project_id, str) or not project_id or not isinstance(project, dict):
        errors.append("Project identity is incomplete.")
    elif project.get("id") != project_id or not isinstance(project.get("name"), str):
        errors.append("Project identity references are inconsistent.")
    if not isinstance(candidate, dict):
        errors.append("Candidate identity is incomplete.")
        candidate = {}
    if (
        not isinstance(candidate.get("id"), str)
        or not candidate.get("id")
        or not isinstance(candidate.get("key"), str)
        or not candidate.get("key")
        or candidate.get("project_id") != project_id
        or candidate.get("schema_version") != CANDIDATE_SCHEMA
        or candidate.get("status") != "FROZEN"
        or type(candidate.get("revision")) is not int
        or candidate.get("revision", 0) < 1
        or not _is_sha256(candidate.get("fingerprint"))
    ):
        errors.append("Candidate revision and fingerprint are incomplete.")
    if not isinstance(scope, dict):
        errors.append("Candidate scope is incomplete.")
        scope = {}

    id_fields = {
        "feature_ids": "features",
        "context_package_ids": "context_packages",
        "evidence_ids": "evidence_records",
        "verification_ids": "verification_evaluations",
        "handoff_revision_ids": "handoff_revisions",
    }
    expected_ids: dict[str, list[str]] = {}
    for scope_key, record_key in id_fields.items():
        selected = scope.get(scope_key)
        if (
            not isinstance(selected, list)
            or any(not isinstance(value, str) or not value for value in selected)
            or len(selected) != len(set(selected))
        ):
            errors.append(f"Candidate scope {scope_key} is invalid.")
            expected_ids[record_key] = []
        else:
            expected_ids[record_key] = sorted(selected)
        records = manifest.get(record_key)
        if not isinstance(records, list) or any(not isinstance(row, dict) for row in records):
            errors.append(f"Manifest {record_key} are incomplete.")
            continue
        actual_ids = [row.get("id") for row in records]
        if any(not isinstance(value, str) or not value for value in actual_ids):
            errors.append(f"Manifest {record_key} contain invalid identifiers.")
        elif sorted(actual_ids) != expected_ids[record_key]:
            errors.append(f"Manifest {record_key} do not match candidate scope.")

    selected_features = set(expected_ids.get("features", []))
    feature_records = (
        manifest.get("features", []) if isinstance(manifest.get("features"), list) else []
    )
    for feature in feature_records:
        if not isinstance(feature, dict):
            continue
        if (
            feature.get("project_id") != project_id
            or not isinstance(feature.get("key"), str)
            or not isinstance(feature.get("title"), str)
            or feature.get("status") is None
        ):
            errors.append("A selected Feature is missing project provenance or required fields.")
            break

    criteria = manifest.get("acceptance_criteria")
    criterion_by_id: dict[str, dict[str, Any]] = {}
    if not isinstance(criteria, list):
        errors.append("Acceptance Criteria snapshot is missing.")
    else:
        for criterion in criteria:
            if (
                not isinstance(criterion, dict)
                or not isinstance(criterion.get("id"), str)
                or not isinstance(criterion.get("feature_id"), str)
                or criterion.get("feature_id") not in selected_features
                or not isinstance(criterion.get("description"), str)
                or not isinstance(criterion.get("satisfied"), bool)
                or not isinstance(criterion.get("position"), int)
                or not isinstance(criterion.get("updated_at"), str)
            ):
                errors.append(
                    "Acceptance Criteria snapshot contains incomplete or out-of-scope data."
                )
                break
            criterion_by_id[criterion["id"]] = criterion
        if len(criterion_by_id) != len(criteria):
            errors.append("Acceptance Criteria identifiers are duplicated.")

    context_by_id: dict[str, dict[str, Any]] = {}
    for package in (
        manifest.get("context_packages", [])
        if isinstance(manifest.get("context_packages"), list)
        else []
    ):
        if not isinstance(package, dict):
            continue
        if (
            package.get("project_id") != project_id
            or not isinstance(package.get("feature_id"), str)
            or package.get("feature_id") not in selected_features
            or not isinstance(package.get("schema_version"), str)
            or not package.get("schema_version")
            or not _is_sha256(package.get("fingerprint"))
            or not _is_sha256(package.get("payload_digest"))
            or package.get("payload_digest") != package.get("fingerprint")
        ):
            errors.append("A Context Package reference lacks valid identity or integrity metadata.")
            break
        context_by_id[package["id"]] = package

    evidence_by_id: dict[str, dict[str, Any]] = {}
    for evidence in (
        manifest.get("evidence_records", [])
        if isinstance(manifest.get("evidence_records"), list)
        else []
    ):
        if not isinstance(evidence, dict):
            continue
        if (
            evidence.get("project_id") != project_id
            or (
                evidence.get("feature_id") is not None
                and not isinstance(evidence.get("feature_id"), str)
            )
            or evidence.get("feature_id") not in {None, *selected_features}
            or not isinstance(evidence.get("provenance"), str)
            or evidence.get("provenance") not in {"REPORTED", "OBSERVED"}
            or not isinstance(evidence.get("status"), str)
            or evidence.get("status") not in {"ACTIVE", "INVALIDATED"}
            or not _is_sha256(evidence.get("record_fingerprint"))
        ):
            errors.append(
                "An Evidence reference lacks valid scope, provenance, or integrity metadata."
            )
            break
        criterion_id = evidence.get("acceptance_criterion_id")
        if criterion_id is not None and (
            not isinstance(criterion_id, str)
            or criterion_id not in criterion_by_id
            or criterion_by_id[criterion_id].get("feature_id") != evidence.get("feature_id")
        ):
            errors.append("Evidence criterion references do not match the frozen Feature scope.")
            break
        evidence_payload = {
            key: value for key, value in evidence.items() if key != "record_fingerprint"
        }
        if digest(canonical_json(evidence_payload)) != evidence.get("record_fingerprint"):
            errors.append("Evidence record fingerprint does not match its frozen content.")
            break
        evidence_by_id[evidence["id"]] = evidence

    handoff_by_id: dict[str, dict[str, Any]] = {}
    for handoff in (
        manifest.get("handoff_revisions", [])
        if isinstance(manifest.get("handoff_revisions"), list)
        else []
    ):
        if not isinstance(handoff, dict):
            continue
        if (
            handoff.get("project_id") != project_id
            or not isinstance(handoff.get("feature_id"), str)
            or handoff.get("feature_id") not in selected_features
            or not isinstance(handoff.get("handoff_id"), str)
            or not isinstance(handoff.get("revision"), int)
            or not _is_sha256(handoff.get("fingerprint"))
            or not _is_sha256(handoff.get("context_fingerprint"))
        ):
            errors.append("A Handoff revision lacks valid scope or integrity metadata.")
            break
        handoff_by_id[handoff["id"]] = handoff

    for evaluation in (
        manifest.get("verification_evaluations", [])
        if isinstance(manifest.get("verification_evaluations"), list)
        else []
    ):
        if not isinstance(evaluation, dict):
            continue
        subject = evaluation.get("subject")
        if (
            evaluation.get("project_id") != project_id
            or (
                evaluation.get("feature_id") is not None
                and not isinstance(evaluation.get("feature_id"), str)
            )
            or evaluation.get("feature_id") not in {None, *selected_features}
            or not isinstance(subject, dict)
            or subject.get("project_id") != project_id
            or subject.get("feature_id") != evaluation.get("feature_id")
            or not isinstance(evaluation.get("rule_id"), str)
            or evaluation.get("rule_id") not in {"V01", "V02", "V03", "V04"}
            or not isinstance(evaluation.get("rule_version"), str)
            or not evaluation.get("rule_version")
            or not _is_sha256(evaluation.get("input_fingerprint"))
            or not isinstance(evaluation.get("result"), str)
            or evaluation.get("result") not in {"PASS", "FAIL", "BLOCKED"}
            or not isinstance(evaluation.get("inputs"), dict)
            or not isinstance(evaluation.get("verifier_version"), str)
            or not evaluation.get("verifier_version")
        ):
            errors.append(
                "A Verification reference lacks valid scope, rule, or integrity metadata."
            )
            break
        inputs = evaluation["inputs"]
        if evaluation["rule_id"] == "V02":
            package_id = inputs.get("context_package_id")
            package = context_by_id.get(package_id) if isinstance(package_id, str) else None
            if package is None or package.get("feature_id") != subject.get("feature_id"):
                errors.append(
                    "V02 verification does not reference its selected Context Package subject."
                )
                break
        elif evaluation["rule_id"] == "V03":
            revision_id = inputs.get("handoff_revision_id")
            handoff = handoff_by_id.get(revision_id) if isinstance(revision_id, str) else None
            if handoff is None or handoff.get("feature_id") != subject.get("feature_id"):
                errors.append("V03 verification does not reference its selected Handoff subject.")
                break
        elif evaluation["rule_id"] == "V04":
            evidence_ids = inputs.get("evidence_ids")
            trace = inputs.get("records")
            if (
                not isinstance(evidence_ids, list)
                or not evidence_ids
                or any(not isinstance(evidence_id, str) for evidence_id in evidence_ids)
                or any(evidence_id not in evidence_by_id for evidence_id in evidence_ids)
                or not isinstance(trace, list)
                or any(
                    not isinstance(row, dict) or not isinstance(row.get("id"), str) for row in trace
                )
                or {row["id"] for row in trace if isinstance(row, dict)} != set(evidence_ids)
            ):
                errors.append(
                    "V04 verification does not reference complete selected Evidence inputs."
                )
                break
            trace_inconsistent = False
            for trace_row in trace:
                trace_id = trace_row.get("id") if isinstance(trace_row, dict) else None
                if not isinstance(trace_id, str):
                    trace_inconsistent = True
                    break
                evidence = evidence_by_id.get(trace_id)
                if evidence is None or any(
                    trace_row.get(trace_key) != evidence.get(evidence_key)
                    for trace_key, evidence_key in (
                        ("feature_id", "feature_id"),
                        ("criterion_id", "acceptance_criterion_id"),
                        ("status", "status"),
                        ("provenance", "provenance"),
                    )
                ):
                    trace_inconsistent = True
                    break
                criterion_id = evidence.get("acceptance_criterion_id")
                criterion = (
                    criterion_by_id.get(criterion_id) if isinstance(criterion_id, str) else None
                )
                if trace_row.get("criterion_feature_id") != (
                    criterion.get("feature_id") if criterion else None
                ):
                    trace_inconsistent = True
                    break
            if trace_inconsistent:
                errors.append("V04 verification trace differs from frozen Evidence provenance.")
                break
        expected_fingerprint = VerificationEngine.input_fingerprint(
            ruleset=VERIFICATION_RULESET,
            rule_id=evaluation["rule_id"],
            rule_version=evaluation["rule_version"],
            subject=subject,
            inputs=inputs,
        )
        if expected_fingerprint != evaluation["input_fingerprint"]:
            errors.append("Verification input fingerprint does not match its frozen inputs.")
            break

    gate = manifest.get("gate_evaluation")
    if (
        manifest.get("ruleset_version") != RELEASE_RULESET
        or not isinstance(gate, dict)
        or gate.get("ruleset_version") != RELEASE_RULESET
        or not isinstance(gate.get("result"), str)
        or gate.get("result") not in {"READY_BY_DEFINED_GATES", "BLOCKED", "STALE"}
    ):
        errors.append("Release ruleset or gate outcome is missing or unsupported.")
    else:
        checks = gate.get("checks")
        if not isinstance(checks, list):
            errors.append("Gate checks are missing.")
        else:
            check_ids = [check.get("rule_id") for check in checks if isinstance(check, dict)]
            expected_check_ids = {"G01", "G02", "G03", "G04", "G05"}
            has_g06 = len(checks) == 6 and "G06" in check_ids
            if has_g06:
                expected_check_ids.add("G06")
            if (
                len(checks) not in {5, 6}
                or any(not isinstance(rule_id, str) for rule_id in check_ids)
                or set(check_ids) != expected_check_ids
            ):
                errors.append("The pre-manifest gate checks are incomplete or duplicated.")
            if any(
                not isinstance(check, dict)
                or check.get("version") != "1.0"
                or not isinstance(check.get("status"), str)
                or check.get("status") not in {"PASS", "BLOCKED", "STALE"}
                or not isinstance(check.get("blockers"), list)
                or not isinstance(check.get("inputs"), list)
                or (
                    check.get("rule_id") == "G06" and not isinstance(check.get("limitations"), list)
                )
                for check in checks
            ):
                errors.append("A gate check has an invalid version, result, or input list.")
            checks_by_id = {
                check.get("rule_id"): check
                for check in checks
                if isinstance(check, dict) and isinstance(check.get("rule_id"), str)
            }
            for rule_id, scope_key in (
                ("G01", "feature_ids"),
                ("G02", "context_package_ids"),
                ("G03", "evidence_ids"),
                ("G04", "verification_ids"),
            ):
                if rule_id in checks_by_id and checks_by_id[rule_id].get("inputs") != scope.get(
                    scope_key
                ):
                    errors.append(f"{rule_id} inputs do not match candidate scope.")
            g05 = checks_by_id.get("G05")
            if g05 is not None:
                g05_inputs = g05.get("inputs")
                if (
                    not isinstance(g05_inputs, list)
                    or len(g05_inputs) != 2
                    or g05_inputs[0] != candidate.get("fingerprint")
                    or not _is_sha256(g05_inputs[1])
                ):
                    errors.append("G05 freshness inputs lack frozen and current fingerprints.")
            expected_result = (
                "READY_BY_DEFINED_GATES"
                if all(check.get("status") == "PASS" for check in checks if isinstance(check, dict))
                else (
                    "STALE"
                    if any(
                        check.get("status") == "STALE"
                        for check in checks
                        if isinstance(check, dict)
                    )
                    else "BLOCKED"
                )
            )
            if gate.get("result") != expected_result:
                errors.append("Manifest gate outcome does not agree with its check results.")
            g06 = checks_by_id.get("G06")
            if g06 is not None:
                g06_inputs = g06.get("inputs")
                if (
                    not isinstance(g06.get("status"), str)
                    or g06.get("status") not in {"PASS", "BLOCKED"}
                    or not isinstance(g06_inputs, list)
                    or len(g06_inputs) != 2
                    or g06_inputs[0] != MANIFEST_SCHEMA
                    or not _is_sha256(g06_inputs[1])
                ):
                    errors.append("G06 completeness result is malformed or lacks its input schema.")

    provenance = manifest.get("provenance")
    integrity = manifest.get("integrity")
    if (
        not isinstance(provenance, dict)
        or not provenance.get("evidence_declarations")
        or not provenance.get("verification")
        or not isinstance(integrity, dict)
        or integrity.get("algorithm") != "SHA-256"
        or integrity.get("canonicalization") != "forge-canonical-json-v1"
        or not _is_sha256(integrity.get("candidate_snapshot_fingerprint"))
        or integrity.get("candidate_snapshot_fingerprint") != candidate.get("fingerprint")
    ):
        errors.append("Manifest integrity or provenance metadata is incomplete.")
    if manifest.get("publication_status") != "NOT_PUBLISHED":
        errors.append("Publication status must remain NOT_PUBLISHED.")
    return errors


class ManifestService(DeliveryServiceBase):
    def __init__(self, context: DeliveryContext, candidates: CandidateService) -> None:
        super().__init__(context)
        self.candidates = candidates

    @staticmethod
    def _markdown(manifest: dict[str, Any]) -> str:
        # Keep all dynamic values inside escaped preformatted blocks.
        safe_json = html.escape(json.dumps(manifest, ensure_ascii=False, sort_keys=True, indent=2))
        return "\n".join(
            [
                "# Forge Release Manifest",
                "",
                "<pre><code>",
                safe_json,
                "</code></pre>",
                "",
                "Release status: NOT_PUBLISHED",
                "",
            ]
        )

    def manifest_save(
        self, workspace_id: str, project_id: str, candidate_id: str, gate_id: str
    ) -> ReleaseManifestModel:
        self.project(workspace_id, project_id, writable=True)
        self.candidates.candidate_get(workspace_id, project_id, candidate_id)
        gate = self.session.scalar(
            select(ReleaseGateEvaluationModel).where(
                ReleaseGateEvaluationModel.id == gate_id,
                ReleaseGateEvaluationModel.project_id == project_id,
                ReleaseGateEvaluationModel.candidate_id == candidate_id,
            )
        )
        if gate is None:
            raise EntityNotFound("Gate evaluation not found")
        existing = self.session.scalar(
            select(ReleaseManifestModel).where(
                ReleaseManifestModel.candidate_id == candidate_id,
                ReleaseManifestModel.gate_evaluation_id == gate.id,
            )
        )
        if existing:
            return existing
        payload = _json(gate.manifest_json)
        manifest = ReleaseManifestModel(
            id=str(uuid4()),
            project_id=project_id,
            candidate_id=candidate_id,
            gate_evaluation_id=gate.id,
            schema_version=MANIFEST_SCHEMA,
            fingerprint=gate.manifest_fingerprint,
            payload_json=canonical_json(payload),
            markdown=self._markdown(payload),
            created_at=utc_now(),
        )
        self.session.add(manifest)
        self.session.commit()
        self.session.refresh(manifest)
        return manifest

    def manifest_get(
        self, workspace_id: str, project_id: str, candidate_id: str, manifest_id: str | None = None
    ) -> ReleaseManifestModel:
        self.project(workspace_id, project_id)
        statement = select(ReleaseManifestModel).where(
            ReleaseManifestModel.project_id == project_id,
            ReleaseManifestModel.candidate_id == candidate_id,
        )
        if manifest_id:
            statement = statement.where(ReleaseManifestModel.id == manifest_id)
        item = self.session.scalar(
            statement.order_by(ReleaseManifestModel.created_at.desc(), ReleaseManifestModel.id)
        )
        if item is None:
            raise EntityNotFound("Release manifest not found")
        return item
