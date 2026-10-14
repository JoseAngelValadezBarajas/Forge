"""Deterministic evidence, verification, release gate and manifest services.

This module records declarations and checks persisted snapshots only. It does not
fetch URLs, read arbitrary files, run commands, or publish releases.
"""

from __future__ import annotations

import hashlib
import html
import json
import re
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlsplit
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.application.services import EntityNotFound, InvalidInput, ProjectService, RevisionConflict
from app.domain.verification import VerificationEngine
from app.persistence.models import (
    AcceptanceCriterionModel,
    AgentRunModel,
    ContextPackageModel,
    EvidenceRecordModel,
    FeatureModel,
    GitObservationModel,
    HandoffModel,
    HandoffRevisionModel,
    ProjectModel,
    ReleaseCandidateModel,
    ReleaseCandidateRevisionModel,
    ReleaseGateEvaluationModel,
    ReleaseManifestModel,
    VerificationEvaluationModel,
)

VERIFICATION_RULESET = "forge-verification-rules-v1"
RELEASE_RULESET = "forge-release-gates-v1"
MANIFEST_SCHEMA = "forge-release-manifest-v1"
CANDIDATE_SCHEMA = "forge-release-candidate-v1"
VERIFIER_VERSION = "forge-verifier-v1"
EVIDENCE_TYPES = {
    "reported_test_result",
    "document_reference",
    "artifact_reference",
    "git_observation_reference",
    "context_snapshot_reference",
    "handoff_revision_reference",
    "manual_attestation",
}
SOURCE_KINDS = {
    "safe_link",
    "artifact",
    "commit",
    "context_package",
    "git_observation",
    "handoff_revision",
    "manual",
}


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=True, sort_keys=True, separators=(",", ":"))


def digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def utc_now() -> datetime:
    return datetime.now(UTC)


def _unique(values: list[str]) -> list[str]:
    if len(values) != len(set(values)):
        raise InvalidInput("Selection contains duplicate identifiers")
    return sorted(values)


def _clean(value: str, field: str, limit: int) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise InvalidInput(f"{field} is required")
    if len(cleaned) > limit:
        raise InvalidInput(f"{field} must be {limit} characters or fewer")
    if any(ord(character) < 32 and character not in "\n\t" for character in cleaned):
        raise InvalidInput(f"{field} cannot contain control characters")
    return cleaned


def _portable_text(value: str | None) -> str | None:
    """Keep user text useful while omitting common local path and credential forms."""
    if value is None:
        return None
    cleaned = re.sub(
        r"(?i)\b[A-Z]:[\\/][^\s,;]+|\\\\[^\s,;]+|/(?:Users|home|private|tmp|var)/[^\s,;]+",
        "[local path omitted]",
        value,
    )
    return re.sub(r"(?i)\b(token|password|secret|api[_-]?key)=([^\s&]+)", r"\1=[redacted]", cleaned)


def _validate_reference(kind: str, raw: str | None) -> str | None:
    value = raw.strip() if raw else ""
    if kind == "manual":
        if value:
            raise InvalidInput("Manual attestations do not accept source references")
        return None
    if not value:
        raise InvalidInput("A source reference is required")
    if any(ord(character) < 32 for character in value):
        raise InvalidInput("Source references cannot contain control characters")
    if kind == "safe_link":
        try:
            parsed = urlsplit(value)
            host = parsed.hostname
            _ = parsed.port
        except ValueError as exc:
            raise InvalidInput("Use a valid HTTP or HTTPS URL without credentials") from exc
        if parsed.scheme.lower() not in {"http", "https"} or not host:
            raise InvalidInput("Only HTTP and HTTPS references are accepted")
        if parsed.username is not None or parsed.password is not None:
            raise InvalidInput("URLs cannot contain embedded credentials")
        return value
    if kind == "artifact" and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,199}", value):
        return value
    if kind == "commit" and re.fullmatch(r"[0-9a-fA-F]{7,64}", value):
        return value.lower()
    if kind in {"context_package", "git_observation", "handoff_revision"}:
        if not re.fullmatch(r"[A-Fa-f0-9-]{36}", value):
            raise InvalidInput("Internal references must be UUID identifiers")
        return value
    raise InvalidInput("Reference does not match its source kind")


def _json(raw: str) -> Any:
    return json.loads(raw)


class DeliveryService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.projects = ProjectService(session)
        self.verifier = VerificationEngine()

    def project(
        self, workspace_id: str, project_id: str, *, writable: bool = False
    ) -> ProjectModel:
        project = self.projects.get(workspace_id, project_id)
        if writable and project.status != "active":
            raise InvalidInput("Archived projects are read-only")
        return project

    def features(self, project_id: str, ids: list[str]) -> list[FeatureModel]:
        wanted = _unique(ids)
        if not wanted:
            raise InvalidInput("Select at least one Feature")
        items = list(
            self.session.scalars(
                select(FeatureModel).where(
                    FeatureModel.project_id == project_id, FeatureModel.id.in_(wanted)
                )
            ).all()
        )
        if len(items) != len(wanted):
            raise InvalidInput("Every selected Feature must belong to this Project")
        return sorted(items, key=lambda item: item.id)

    def evidence_list(
        self,
        workspace_id: str,
        project_id: str,
        *,
        query: str | None = None,
        provenance: str | None = None,
        status: str | None = None,
    ) -> list[EvidenceRecordModel]:
        self.project(workspace_id, project_id)
        statement = select(EvidenceRecordModel).where(EvidenceRecordModel.project_id == project_id)
        if provenance:
            statement = statement.where(EvidenceRecordModel.provenance == provenance)
        if status:
            statement = statement.where(EvidenceRecordModel.status == status)
        if query and query.strip():
            value = f"%{query.strip()}%"
            statement = statement.where(EvidenceRecordModel.title.ilike(value))
        return list(
            self.session.scalars(
                statement.order_by(EvidenceRecordModel.recorded_at.desc(), EvidenceRecordModel.id)
            ).all()
        )

    def evidence_get(
        self, workspace_id: str, project_id: str, evidence_id: str
    ) -> EvidenceRecordModel:
        self.project(workspace_id, project_id)
        item = self.session.scalar(
            select(EvidenceRecordModel).where(
                EvidenceRecordModel.id == evidence_id, EvidenceRecordModel.project_id == project_id
            )
        )
        if item is None:
            raise EntityNotFound("Evidence record not found")
        return item

    def evidence_create(
        self, workspace_id: str, project_id: str, values: dict[str, Any]
    ) -> EvidenceRecordModel:
        project = self.project(workspace_id, project_id, writable=True)
        evidence_type = values["evidence_type"]
        source_kind = values["source_kind"]
        if evidence_type not in EVIDENCE_TYPES or source_kind not in SOURCE_KINDS:
            raise InvalidInput("Evidence type or source kind is not supported")
        feature_id = values.get("feature_id")
        criterion_id = values.get("acceptance_criterion_id")
        feature = None
        if feature_id:
            feature = self.session.scalar(
                select(FeatureModel).where(
                    FeatureModel.id == feature_id, FeatureModel.project_id == project_id
                )
            )
            if feature is None:
                raise InvalidInput("Feature must belong to this Project")
        elif criterion_id:
            raise InvalidInput("A Feature is required when linking an acceptance criterion")
        if criterion_id:
            criterion = self.session.scalar(
                select(AcceptanceCriterionModel).where(
                    AcceptanceCriterionModel.id == criterion_id,
                    AcceptanceCriterionModel.feature_id == feature_id,
                )
            )
            if criterion is None:
                raise InvalidInput("Acceptance criterion must belong to the selected Feature")
        refs: dict[str, str | None] = {
            "source_reference": _validate_reference(source_kind, values.get("source_reference")),
            "context_package_id": None,
            "git_observation_id": None,
            "handoff_revision_id": None,
            "run_id": values.get("run_id"),
        }
        if source_kind == "context_package":
            package = self.session.get(ContextPackageModel, refs["source_reference"])
            if (
                package is None
                or package.project_id != project_id
                or package.feature_id != feature_id
            ):
                raise InvalidInput(
                    "Context Package must belong to the selected Feature and Project"
                )
            refs["context_package_id"] = package.id
        elif source_kind == "git_observation":
            observation = self.session.get(GitObservationModel, refs["source_reference"])
            if observation is None:
                raise InvalidInput("Git observation must belong to this Project")
            connection = None
            from app.persistence.models import RepositoryConnectionModel

            connection = self.session.get(RepositoryConnectionModel, observation.repository_id)
            if connection is None or connection.project_id != project_id:
                raise InvalidInput("Git observation must belong to this Project")
            refs["git_observation_id"] = observation.id
        elif source_kind == "handoff_revision":
            revision = self.session.get(HandoffRevisionModel, refs["source_reference"])
            if revision is None:
                raise InvalidInput(
                    "Handoff revision must belong to the selected Feature and Project"
                )
            handoff = self.session.get(HandoffModel, revision.handoff_id) if revision else None
            if (
                handoff is None
                or handoff.project_id != project_id
                or handoff.feature_id != feature_id
            ):
                raise InvalidInput(
                    "Handoff revision must belong to the selected Feature and Project"
                )
            refs["handoff_revision_id"] = revision.id
        if refs["run_id"]:
            run = self.session.get(AgentRunModel, refs["run_id"])
            if run is None or run.project_id != project_id or run.feature_id != feature_id:
                raise InvalidInput("Run must belong to the selected Feature and Project")
        provenance = (
            "OBSERVED"
            if source_kind in {"git_observation", "context_package", "handoff_revision"}
            else "REPORTED"
        )
        item = EvidenceRecordModel(
            id=str(uuid4()),
            project_id=project.id,
            feature_id=feature_id,
            acceptance_criterion_id=criterion_id,
            run_id=refs["run_id"],
            handoff_revision_id=refs["handoff_revision_id"],
            context_package_id=refs["context_package_id"],
            git_observation_id=refs["git_observation_id"],
            evidence_type=evidence_type,
            title=_clean(values["title"], "Title", 200),
            description=(values.get("description") or "").strip(),
            source_kind=source_kind,
            source_reference=refs["source_reference"],
            provenance=provenance,
            declared_outcome=(values.get("declared_outcome") or "").strip() or None,
            status="ACTIVE",
            recorded_at=utc_now(),
        )
        self.session.add(item)
        self.session.commit()
        self.session.refresh(item)
        return item

    def evidence_invalidate(
        self, workspace_id: str, project_id: str, evidence_id: str
    ) -> EvidenceRecordModel:
        self.project(workspace_id, project_id, writable=True)
        item = self.evidence_get(workspace_id, project_id, evidence_id)
        if item.status != "ACTIVE":
            raise InvalidInput("Only active evidence can be invalidated")
        item.status = "INVALIDATED"
        item.invalidated_at = utc_now()
        item.version += 1
        self.session.commit()
        self.session.refresh(item)
        return item

    @staticmethod
    def rule_catalog() -> list[dict[str, Any]]:
        return [
            {
                "rule_id": "V01",
                "version": "1.0",
                "title": "Artifact integrity",
                "available": False,
                "required_inputs": ["managed artifact bytes", "expected SHA-256"],
                "limitation": "Forge does not yet import or store artifact bytes.",
            },
            {
                "rule_id": "V02",
                "version": "1.0",
                "title": "Context Package integrity",
                "available": True,
                "required_inputs": ["saved Context Package ID"],
                "limitation": "Checks snapshot integrity only; it does not verify implementation.",
            },
            {
                "rule_id": "V03",
                "version": "1.0",
                "title": "Handoff revision integrity",
                "available": True,
                "required_inputs": ["saved Handoff revision ID"],
                "limitation": (
                    "Checks immutable report provenance only; acknowledgement is not execution "
                    "evidence."
                ),
            },
            {
                "rule_id": "V04",
                "version": "1.0",
                "title": "Evidence traceability",
                "available": True,
                "required_inputs": ["Evidence record IDs"],
                "limitation": "Checks ownership and links, not functional behavior.",
            },
        ]

    def _verification_inputs(
        self, project_id: str, rule_id: str, values: dict[str, Any]
    ) -> tuple[str | None, dict[str, Any], list[str], str, list[str]]:
        if rule_id not in {"V01", "V02", "V03", "V04"}:
            raise InvalidInput("Unknown verification rule")
        feature_id = values.get("feature_id")
        inputs: dict[str, Any] = {"rule_id": rule_id, "rule_version": "1.0"}
        evidence_ids: list[str] = []
        findings: list[str]
        limitations: list[str]
        result: str
        if rule_id == "V01":
            inputs["managed_artifact"] = None
            result = "BLOCKED"
            findings = ["No managed artifact bytes are available for hashing."]
            limitations = [
                "Artifact import is outside this FND-06 implementation; declared references are "
                "not read or fetched."
            ]
        elif rule_id == "V02":
            package_id = values.get("context_package_id")
            package = self.session.get(ContextPackageModel, package_id) if package_id else None
            if package is None or package.project_id != project_id:
                raise InvalidInput("Saved Context Package must belong to this Project")
            feature_id = package.feature_id
            payload = _json(package.payload_json)
            expected_digest = values.get("expected_digest") or package.fingerprint
            actual, matched = self.verifier.context_integrity(
                payload, package.fingerprint, expected_digest
            )
            inputs.update(
                {
                    "context_package_id": package.id,
                    "schema_version": package.schema_version,
                    "stored_fingerprint": package.fingerprint,
                    "payload_digest": actual,
                    "expected_digest": expected_digest,
                }
            )
            result = "PASS" if matched else "FAIL"
            findings = [
                "Canonical Context Package payload fingerprint matches."
                if matched
                else "Canonical Context Package payload fingerprint does not match the "
                "expected digest."
            ]
            limitations = [
                "Proves snapshot integrity only; planning readiness and implementation are not "
                "verified."
            ]
        elif rule_id == "V03":
            revision = self.session.get(HandoffRevisionModel, values.get("handoff_revision_id"))
            handoff = self.session.get(HandoffModel, revision.handoff_id) if revision else None
            if revision is None or handoff is None or handoff.project_id != project_id:
                raise InvalidInput("Saved Handoff revision must belong to this Project")
            payload = _json(revision.payload_json)
            actual, identities_match, matched = self.verifier.handoff_integrity(
                payload,
                revision.fingerprint,
                {
                    "schema": "forge-handoff-v1",
                    "handoff_id": handoff.id,
                    "revision": revision.revision,
                    "project_id": project_id,
                    "feature_id": handoff.feature_id,
                },
            )
            identities_match = identities_match and revision.schema_version == "forge-handoff-v1"
            matched = matched and identities_match
            feature_id = handoff.feature_id
            inputs.update(
                {
                    "handoff_id": handoff.id,
                    "handoff_revision_id": revision.id,
                    "revision": revision.revision,
                    "schema_version": revision.schema_version,
                    "stored_fingerprint": revision.fingerprint,
                    "payload_digest": actual,
                    "identities_match": identities_match,
                }
            )
            result = "PASS" if matched else "FAIL"
            findings = [
                "Immutable handoff revision payload and identity match."
                if matched
                else "Handoff revision payload, fingerprint, or identity is inconsistent."
            ]
            limitations = [
                "A handoff is a report. Acknowledgement does not prove execution or code quality."
            ]
        else:
            evidence_ids = _unique(values.get("evidence_ids", []))
            if not evidence_ids:
                raise InvalidInput("Select at least one Evidence Record")
            records = list(
                self.session.scalars(
                    select(EvidenceRecordModel).where(
                        EvidenceRecordModel.project_id == project_id,
                        EvidenceRecordModel.id.in_(evidence_ids),
                    )
                ).all()
            )
            if len(records) != len(evidence_ids):
                raise InvalidInput("Every Evidence Record must belong to this Project")
            features = {row.id for row in records if row.feature_id is not None}
            if feature_id and any(row.feature_id not in {None, feature_id} for row in records):
                raise InvalidInput("Evidence Records must belong to the selected Feature")
            if not feature_id and len(features) == 1:
                feature_id = next(iter(features))
            criteria = {
                row.id: row.feature_id
                for row in self.session.scalars(
                    select(AcceptanceCriterionModel).where(
                        AcceptanceCriterionModel.id.in_(
                            [
                                r.acceptance_criterion_id
                                for r in records
                                if r.acceptance_criterion_id
                            ]
                        )
                    )
                ).all()
            }
            trace = [
                {
                    "id": row.id,
                    "feature_id": row.feature_id,
                    "criterion_id": row.acceptance_criterion_id,
                    "criterion_feature_id": criteria.get(row.acceptance_criterion_id or ""),
                    "status": row.status,
                    "provenance": row.provenance,
                }
                for row in sorted(records, key=lambda item: item.id)
            ]
            consistent = self.verifier.evidence_traceability_is_valid(trace)
            active = all(row.status == "ACTIVE" for row in records)
            inputs.update({"evidence_ids": evidence_ids, "records": trace})
            result = "PASS" if consistent and active else "FAIL"
            findings = [
                (
                    "Selected records exist in this Project and their Feature/criterion links "
                    "are coherent."
                    if result == "PASS"
                    else "One or more selected records are invalidated or have inconsistent "
                    "criterion ownership."
                )
            ]
            limitations = [
                "Structural traceability does not verify the truth of declarations or functional "
                "acceptance."
            ]
        return (
            feature_id,
            inputs,
            evidence_ids,
            result,
            findings + ["LIMITATIONS: " + item for item in limitations],
        )

    def verification_preview(
        self, workspace_id: str, project_id: str, rule_id: str, values: dict[str, Any]
    ) -> dict[str, Any]:
        self.project(workspace_id, project_id)
        feature_id, inputs, evidence_ids, result, messages = self._verification_inputs(
            project_id, rule_id, values
        )
        limitations = [
            item.removeprefix("LIMITATIONS: ")
            for item in messages
            if item.startswith("LIMITATIONS: ")
        ]
        findings = [item for item in messages if not item.startswith("LIMITATIONS: ")]
        subject = {"project_id": project_id, "feature_id": feature_id}
        fingerprint = self.verifier.input_fingerprint(
            ruleset=VERIFICATION_RULESET,
            rule_id=rule_id,
            rule_version="1.0",
            subject=subject,
            inputs=inputs,
        )
        return {
            "id": None,
            "rule_id": rule_id,
            "rule_version": "1.0",
            "subject": subject,
            "inputs": inputs,
            "input_fingerprint": fingerprint,
            "result": result,
            "findings": findings,
            "limitations": limitations,
            "evidence_ids": evidence_ids,
            "verifier_version": VERIFIER_VERSION,
            "evaluated_at": None,
            "stale": False,
        }

    def verification_evaluate(
        self, workspace_id: str, project_id: str, rule_id: str, values: dict[str, Any]
    ) -> VerificationEvaluationModel:
        self.project(workspace_id, project_id, writable=True)
        result = self.verification_preview(workspace_id, project_id, rule_id, values)
        item = VerificationEvaluationModel(
            id=str(uuid4()),
            project_id=project_id,
            feature_id=result["subject"]["feature_id"],
            rule_id=rule_id,
            rule_version=result["rule_version"],
            subject_json=canonical_json(result["subject"]),
            input_json=canonical_json(result["inputs"]),
            input_fingerprint=result["input_fingerprint"],
            result=result["result"],
            findings_json=canonical_json(result["findings"]),
            limitations_json=canonical_json(result["limitations"]),
            evidence_ids_json=canonical_json(result["evidence_ids"]),
            verifier_version=VERIFIER_VERSION,
            evaluated_at=utc_now(),
        )
        self.session.add(item)
        self.session.commit()
        self.session.refresh(item)
        return item

    def verification_list(
        self, workspace_id: str, project_id: str
    ) -> list[VerificationEvaluationModel]:
        self.project(workspace_id, project_id)
        return list(
            self.session.scalars(
                select(VerificationEvaluationModel)
                .where(VerificationEvaluationModel.project_id == project_id)
                .order_by(
                    VerificationEvaluationModel.evaluated_at.desc(), VerificationEvaluationModel.id
                )
            ).all()
        )

    def verification_get(
        self, workspace_id: str, project_id: str, evaluation_id: str
    ) -> VerificationEvaluationModel:
        self.project(workspace_id, project_id)
        item = self.session.scalar(
            select(VerificationEvaluationModel).where(
                VerificationEvaluationModel.id == evaluation_id,
                VerificationEvaluationModel.project_id == project_id,
            )
        )
        if item is None:
            raise EntityNotFound("Verification evaluation not found")
        return item

    def verification_is_stale(
        self, workspace_id: str, project_id: str, item: VerificationEvaluationModel
    ) -> bool:
        inputs = _json(item.input_json)
        values: dict[str, Any] = {"feature_id": item.feature_id}
        if item.rule_id == "V02":
            values.update(
                {
                    "context_package_id": inputs["context_package_id"],
                    "expected_digest": inputs["expected_digest"],
                }
            )
        elif item.rule_id == "V03":
            values["handoff_revision_id"] = inputs["handoff_revision_id"]
        elif item.rule_id == "V04":
            values["evidence_ids"] = inputs["evidence_ids"]
        current = self.verification_preview(workspace_id, project_id, item.rule_id, values)
        return bool(current["input_fingerprint"] != item.input_fingerprint)

    def _selection(self, project_id: str, values: dict[str, Any]) -> dict[str, Any]:
        feature_ids = _unique(values.get("feature_ids", []))
        self.features(project_id, feature_ids)
        contexts = _unique(values.get("context_package_ids", []))
        evidences = _unique(values.get("evidence_ids", []))
        verifications = _unique(values.get("verification_ids", []))
        handoffs = _unique(values.get("handoff_revision_ids", []))
        package_rows = (
            list(
                self.session.scalars(
                    select(ContextPackageModel).where(
                        ContextPackageModel.project_id == project_id,
                        ContextPackageModel.id.in_(contexts),
                    )
                ).all()
            )
            if contexts
            else []
        )
        if len(package_rows) != len(contexts) or any(
            row.feature_id not in feature_ids for row in package_rows
        ):
            raise InvalidInput("Context Packages must belong to selected Features in this Project")
        evidence_rows = (
            list(
                self.session.scalars(
                    select(EvidenceRecordModel).where(
                        EvidenceRecordModel.project_id == project_id,
                        EvidenceRecordModel.id.in_(evidences),
                    )
                ).all()
            )
            if evidences
            else []
        )
        if len(evidence_rows) != len(evidences) or any(
            row.feature_id not in {None, *feature_ids} for row in evidence_rows
        ):
            raise InvalidInput("Evidence must belong to this Project and selected Features")
        verification_rows = (
            list(
                self.session.scalars(
                    select(VerificationEvaluationModel).where(
                        VerificationEvaluationModel.project_id == project_id,
                        VerificationEvaluationModel.id.in_(verifications),
                    )
                ).all()
            )
            if verifications
            else []
        )
        if len(verification_rows) != len(verifications) or any(
            row.feature_id not in {None, *feature_ids} for row in verification_rows
        ):
            raise InvalidInput("Verifications must belong to this Project and selected Features")
        if handoffs:
            handoff_rows = list(
                self.session.scalars(
                    select(HandoffRevisionModel).where(HandoffRevisionModel.id.in_(handoffs))
                ).all()
            )
            parents = {
                row.id: self.session.get(HandoffModel, row.handoff_id) for row in handoff_rows
            }
            if len(handoff_rows) != len(handoffs) or any(
                parent is None
                or parent.project_id != project_id
                or parent.feature_id not in feature_ids
                for parent in parents.values()
            ):
                raise InvalidInput(
                    "Handoff revisions must belong to selected Features in this Project"
                )
        return {
            "feature_ids": feature_ids,
            "context_package_ids": contexts,
            "evidence_ids": evidences,
            "verification_ids": verifications,
            "handoff_revision_ids": handoffs,
        }

    def candidate_list(self, workspace_id: str, project_id: str) -> list[ReleaseCandidateModel]:
        self.project(workspace_id, project_id)
        return list(
            self.session.scalars(
                select(ReleaseCandidateModel)
                .where(ReleaseCandidateModel.project_id == project_id)
                .order_by(ReleaseCandidateModel.created_at.desc(), ReleaseCandidateModel.id)
            ).all()
        )

    def candidate_get(
        self, workspace_id: str, project_id: str, candidate_id: str
    ) -> ReleaseCandidateModel:
        self.project(workspace_id, project_id)
        item = self.session.scalar(
            select(ReleaseCandidateModel).where(
                ReleaseCandidateModel.id == candidate_id,
                ReleaseCandidateModel.project_id == project_id,
            )
        )
        if item is None:
            raise EntityNotFound("Release Candidate not found")
        return item

    def candidate_create(
        self, workspace_id: str, project_id: str, values: dict[str, Any]
    ) -> ReleaseCandidateModel:
        self.project(workspace_id, project_id, writable=True)
        selection = self._selection(project_id, values)
        title = _clean(values["title"], "Candidate title", 200)
        candidate_id = str(uuid4())
        key = "RC-" + candidate_id[:8].upper()
        content = {
            "project_id": project_id,
            "candidate_key": key,
            "title": title,
            "intended_version": values.get("intended_version"),
            "description": (values.get("description") or "").strip(),
            "selection": selection,
        }
        item = ReleaseCandidateModel(
            id=candidate_id,
            project_id=project_id,
            candidate_key=key,
            title=title,
            intended_version=values.get("intended_version"),
            description=content["description"],
            status="DRAFT",
            schema_version=CANDIDATE_SCHEMA,
            revision=1,
            content_fingerprint=digest(canonical_json(content)),
            selection_json=canonical_json(selection),
            snapshot_json=None,
            created_at=utc_now(),
            updated_at=utc_now(),
        )
        self.session.add(item)
        self.session.flush()
        self.session.add(
            ReleaseCandidateRevisionModel(
                id=str(uuid4()),
                candidate_id=item.id,
                revision=1,
                status="DRAFT",
                content_fingerprint=item.content_fingerprint,
                snapshot_json=canonical_json(content),
                created_at=utc_now(),
            )
        )
        self.session.commit()
        self.session.refresh(item)
        return item

    def candidate_update(
        self, workspace_id: str, project_id: str, candidate_id: str, values: dict[str, Any]
    ) -> ReleaseCandidateModel:
        self.project(workspace_id, project_id, writable=True)
        item = self.candidate_get(workspace_id, project_id, candidate_id)
        if item.status != "DRAFT":
            raise InvalidInput("Frozen candidates cannot be edited; create a new candidate")
        if values["expected_revision"] != item.revision:
            raise RevisionConflict("Candidate changed; reload before editing")
        selection = self._selection(project_id, values)
        title = _clean(values["title"], "Candidate title", 200)
        revision = item.revision + 1
        description = (values.get("description") or "").strip()
        content = {
            "project_id": project_id,
            "candidate_key": item.candidate_key,
            "title": title,
            "intended_version": values.get("intended_version"),
            "description": description,
            "selection": selection,
        }
        item.title = title
        item.intended_version = values.get("intended_version")
        item.description = description
        item.selection_json = canonical_json(selection)
        item.revision = revision
        item.content_fingerprint = digest(canonical_json(content))
        item.updated_at = utc_now()
        self.session.add(
            ReleaseCandidateRevisionModel(
                id=str(uuid4()),
                candidate_id=item.id,
                revision=revision,
                status="DRAFT",
                content_fingerprint=item.content_fingerprint,
                snapshot_json=canonical_json(content),
                created_at=utc_now(),
            )
        )
        self.session.commit()
        self.session.refresh(item)
        return item

    def _capture_candidate(self, item: ReleaseCandidateModel) -> dict[str, Any]:
        selection = _json(item.selection_json)
        project = self.session.get(ProjectModel, item.project_id)
        if project is None:
            raise EntityNotFound("Project not found")
        features = self.features(item.project_id, selection["feature_ids"])
        feature_records = [
            {
                "id": row.id,
                "key": row.readable_id,
                "title": _portable_text(row.title),
                "goal": _portable_text(row.goal),
                "status": row.status,
                "updated_at": row.updated_at.isoformat(),
            }
            for row in features
        ]
        contexts = (
            list(
                self.session.scalars(
                    select(ContextPackageModel).where(
                        ContextPackageModel.id.in_(selection["context_package_ids"])
                    )
                ).all()
            )
            if selection["context_package_ids"]
            else []
        )
        context_records = [
            {
                "id": row.id,
                "feature_id": row.feature_id,
                "schema_version": row.schema_version,
                "fingerprint": row.fingerprint,
                "payload_digest": digest(canonical_json(_json(row.payload_json))),
            }
            for row in sorted(contexts, key=lambda value: value.id)
        ]
        evidences = (
            list(
                self.session.scalars(
                    select(EvidenceRecordModel).where(
                        EvidenceRecordModel.id.in_(selection["evidence_ids"])
                    )
                ).all()
            )
            if selection["evidence_ids"]
            else []
        )
        evidence_records = [
            {
                "id": row.id,
                "feature_id": row.feature_id,
                "acceptance_criterion_id": row.acceptance_criterion_id,
                "title": _portable_text(row.title),
                "description": _portable_text(row.description),
                "declared_outcome": _portable_text(row.declared_outcome),
                "evidence_type": row.evidence_type,
                "source_kind": row.source_kind,
                "source_reference_digest": digest(row.source_reference)
                if row.source_reference
                else None,
                "provenance": row.provenance,
                "status": row.status,
                "version": row.version,
            }
            for row in sorted(evidences, key=lambda value: value.id)
        ]
        verification_rows = (
            list(
                self.session.scalars(
                    select(VerificationEvaluationModel).where(
                        VerificationEvaluationModel.id.in_(selection["verification_ids"])
                    )
                ).all()
            )
            if selection["verification_ids"]
            else []
        )
        verifications = [
            {
                "id": row.id,
                "rule_id": row.rule_id,
                "rule_version": row.rule_version,
                "result": row.result,
                "input_fingerprint": row.input_fingerprint,
                "evidence_ids": _json(row.evidence_ids_json),
            }
            for row in sorted(verification_rows, key=lambda value: value.id)
        ]
        handoff_rows = (
            list(
                self.session.scalars(
                    select(HandoffRevisionModel).where(
                        HandoffRevisionModel.id.in_(selection["handoff_revision_ids"])
                    )
                ).all()
            )
            if selection["handoff_revision_ids"]
            else []
        )
        handoffs = [
            {
                "id": row.id,
                "handoff_id": row.handoff_id,
                "revision": row.revision,
                "fingerprint": row.fingerprint,
                "context_fingerprint": row.context_fingerprint,
            }
            for row in sorted(handoff_rows, key=lambda value: value.id)
        ]
        return {
            "schema_version": CANDIDATE_SCHEMA,
            "project_id": item.project_id,
            "project": {"id": project.id, "name": _portable_text(project.name)},
            "candidate_id": item.id,
            "candidate_key": item.candidate_key,
            "candidate_revision": item.revision,
            "title": _portable_text(item.title),
            "intended_version": _portable_text(item.intended_version),
            "scope": selection,
            "features": feature_records,
            "context_packages": context_records,
            "evidence_records": evidence_records,
            "verification_evaluations": verifications,
            "handoff_revisions": handoffs,
            "ruleset_version": RELEASE_RULESET,
            "captured_at": utc_now().isoformat(),
            "publication_status": "NOT_PUBLISHED",
        }

    def candidate_freeze(
        self, workspace_id: str, project_id: str, candidate_id: str, expected_revision: int
    ) -> ReleaseCandidateModel:
        self.project(workspace_id, project_id, writable=True)
        item = self.candidate_get(workspace_id, project_id, candidate_id)
        if item.status != "DRAFT":
            raise InvalidInput("Candidate is already frozen")
        if expected_revision != item.revision:
            raise RevisionConflict("Candidate changed; reload before freezing")
        item.revision += 1
        snapshot = self._capture_candidate(item)
        snapshot_json = canonical_json(snapshot)
        item.status = "FROZEN"
        item.snapshot_json = snapshot_json
        item.content_fingerprint = digest(snapshot_json)
        item.updated_at = utc_now()
        item.frozen_at = utc_now()
        self.session.add(
            ReleaseCandidateRevisionModel(
                id=str(uuid4()),
                candidate_id=item.id,
                revision=item.revision,
                status="FROZEN",
                content_fingerprint=item.content_fingerprint,
                snapshot_json=snapshot_json,
                created_at=utc_now(),
            )
        )
        self.session.commit()
        self.session.refresh(item)
        return item

    def _gate_result(self, item: ReleaseCandidateModel) -> dict[str, Any]:
        if item.status != "FROZEN" or not item.snapshot_json:
            raise InvalidInput("Freeze the candidate before evaluating release gates")
        snapshot = _json(item.snapshot_json)
        current = self._capture_candidate(item)
        current.pop("captured_at", None)
        historical = dict(snapshot)
        historical.pop("captured_at", None)
        stale = digest(canonical_json(current)) != digest(canonical_json(historical))
        selected = snapshot["scope"]
        chosen_features = set(selected["feature_ids"])
        feature_ids = {row["id"] for row in snapshot["features"]}
        context_by_feature = {row["feature_id"]: row for row in snapshot["context_packages"]}
        criteria = (
            list(
                self.session.scalars(
                    select(AcceptanceCriterionModel).where(
                        AcceptanceCriterionModel.feature_id.in_(chosen_features)
                    )
                ).all()
            )
            if chosen_features
            else []
        )
        covered = {
            row["acceptance_criterion_id"]
            for row in snapshot["evidence_records"]
            if row["status"] == "ACTIVE" and row["acceptance_criterion_id"]
        }
        checks = [
            {
                "rule_id": "G01",
                "version": "1.0",
                "status": "PASS"
                if len(feature_ids) == len(chosen_features) and bool(feature_ids)
                else "BLOCKED",
                "explanation": "Selected Features are present in the frozen Project scope."
                if len(feature_ids) == len(chosen_features) and feature_ids
                else "Candidate has missing or invalid Feature scope.",
                "inputs": selected["feature_ids"],
                "blockers": []
                if len(feature_ids) == len(chosen_features) and feature_ids
                else ["Select at least one in-scope Feature."],
                "limitations": ["Scope integrity does not establish implementation completeness."],
            },
            {
                "rule_id": "G02",
                "version": "1.0",
                "status": "PASS"
                if all(
                    feature_id in context_by_feature
                    and context_by_feature[feature_id]["payload_digest"]
                    == context_by_feature[feature_id]["fingerprint"]
                    for feature_id in chosen_features
                )
                else "BLOCKED",
                "explanation": "Each selected Feature has a pinned Context Package with a "
                "matching canonical fingerprint."
                if all(
                    feature_id in context_by_feature
                    and context_by_feature[feature_id]["payload_digest"]
                    == context_by_feature[feature_id]["fingerprint"]
                    for feature_id in chosen_features
                )
                else "One or more selected Features lack an intact pinned Context Package.",
                "inputs": [row["id"] for row in snapshot["context_packages"]],
                "blockers": []
                if all(
                    feature_id in context_by_feature
                    and context_by_feature[feature_id]["payload_digest"]
                    == context_by_feature[feature_id]["fingerprint"]
                    for feature_id in chosen_features
                )
                else ["Pin a saved Context Package for every selected Feature."],
                "limitations": ["Context integrity does not prove the plan was implemented."],
            },
            {
                "rule_id": "G03",
                "version": "1.0",
                "status": "PASS" if all(row.id in covered for row in criteria) else "BLOCKED",
                "explanation": "Every current acceptance criterion has selected active linked "
                "evidence."
                if all(row.id in covered for row in criteria)
                else "Some current acceptance criteria lack linked active evidence.",
                "inputs": selected["evidence_ids"],
                "blockers": []
                if all(row.id in covered for row in criteria)
                else [
                    f"Missing linked evidence for "
                    f"{sum(row.id not in covered for row in criteria)} acceptance "
                    "criterion/criteria."
                ],
                "limitations": [
                    "Linked evidence is documentary coverage, not independently verified "
                    "functional behavior."
                ],
            },
            {
                "rule_id": "G04",
                "version": "1.0",
                "status": "PASS"
                if snapshot["verification_evaluations"]
                and all(row["result"] == "PASS" for row in snapshot["verification_evaluations"])
                else "BLOCKED",
                "explanation": "Selected deterministic verification evaluations passed."
                if snapshot["verification_evaluations"]
                and all(row["result"] == "PASS" for row in snapshot["verification_evaluations"])
                else "No required successful deterministic evaluations are pinned, or a "
                "selected evaluation did not pass.",
                "inputs": selected["verification_ids"],
                "blockers": []
                if snapshot["verification_evaluations"]
                and all(row["result"] == "PASS" for row in snapshot["verification_evaluations"])
                else ["Pin at least one passing supported verification evaluation."],
                "limitations": ["Only the explicit properties of the selected rules were checked."],
            },
            {
                "rule_id": "G05",
                "version": "1.0",
                "status": "STALE" if stale else "PASS",
                "explanation": "Current selected inputs still match the frozen snapshot."
                if not stale
                else "One or more selected inputs changed after candidate freeze.",
                "inputs": [item.content_fingerprint],
                "blockers": ["Freeze a new candidate revision after reviewing changed inputs."]
                if stale
                else [],
                "limitations": ["Freshness compares the explicit recorded candidate inputs."],
            },
        ]
        pre_manifest_result = (
            "READY_BY_DEFINED_GATES"
            if all(check["status"] == "PASS" for check in checks)
            else ("STALE" if stale else "BLOCKED")
        )
        manifest = {
            "schema": MANIFEST_SCHEMA,
            "project_id": item.project_id,
            "project": snapshot["project"],
            "candidate": {
                "id": item.id,
                "key": item.candidate_key,
                "revision": item.revision,
                "fingerprint": item.content_fingerprint,
            },
            "scope": snapshot["scope"],
            "features": snapshot["features"],
            "context_packages": snapshot["context_packages"],
            "evidence_records": snapshot["evidence_records"],
            "verification_evaluations": snapshot["verification_evaluations"],
            "handoff_revisions": snapshot["handoff_revisions"],
            "gate_evaluation": {
                "result": pre_manifest_result,
                "ruleset_version": RELEASE_RULESET,
                "checks": checks,
            },
            "provenance": {
                "evidence_declarations": "REPORTED unless explicitly observed from persisted "
                "Forge records",
                "verification": "VERIFIED only for each named deterministic rule and its "
                "listed inputs",
            },
            "limitations": [
                "Gate satisfaction is limited to this ruleset and these inputs.",
                "No claim of functional completeness, publication, deployment, or external CI "
                "verification is made.",
            ],
            "publication_status": "NOT_PUBLISHED",
            "candidate_captured_at": snapshot["captured_at"],
        }
        manifest_fingerprint = digest(canonical_json(manifest))
        completeness = bool(
            manifest.get("project_id")
            and manifest.get("candidate", {}).get("id")
            and manifest.get("candidate", {}).get("fingerprint")
            and manifest_fingerprint
        )
        checks.append(
            {
                "rule_id": "G06",
                "version": "1.0",
                "status": "PASS" if completeness else "BLOCKED",
                "explanation": "Versioned manifest contains required identifiers and fingerprints."
                if completeness
                else "Manifest is missing required identifiers or fingerprints.",
                "inputs": [manifest_fingerprint],
                "blockers": [] if completeness else ["Complete required manifest fields."],
                "limitations": ["Manifest completeness does not mean publication occurred."],
            }
        )
        result = (
            "READY_BY_DEFINED_GATES"
            if all(check["status"] == "PASS" for check in checks)
            else (
                "STALE"
                if stale or any(check["status"] == "STALE" for check in checks)
                else "BLOCKED"
            )
        )
        manifest["gate_evaluation"]["result"] = result
        manifest["gate_evaluation"]["checks"] = checks
        manifest_fingerprint = digest(canonical_json(manifest))
        fingerprint = digest(
            canonical_json(
                {
                    "candidate_id": item.id,
                    "candidate_revision": item.revision,
                    "ruleset": RELEASE_RULESET,
                    "snapshot_fingerprint": digest(canonical_json(snapshot)),
                    "checks": checks,
                }
            )
        )
        return {
            "result": result,
            "checks": checks,
            "limitations": manifest["limitations"],
            "input_fingerprint": fingerprint,
            "manifest": manifest,
            "manifest_fingerprint": manifest_fingerprint,
            "stale": stale,
        }

    def candidate_gate_preview(
        self, workspace_id: str, project_id: str, candidate_id: str
    ) -> dict[str, Any]:
        self.project(workspace_id, project_id)
        return self._gate_result(self.candidate_get(workspace_id, project_id, candidate_id))

    def candidate_gate_evaluate(
        self, workspace_id: str, project_id: str, candidate_id: str
    ) -> ReleaseGateEvaluationModel:
        self.project(workspace_id, project_id, writable=True)
        item = self.candidate_get(workspace_id, project_id, candidate_id)
        result = self._gate_result(item)
        gate = ReleaseGateEvaluationModel(
            id=str(uuid4()),
            project_id=project_id,
            candidate_id=item.id,
            candidate_revision=item.revision,
            ruleset_version=RELEASE_RULESET,
            input_fingerprint=result["input_fingerprint"],
            result=result["result"],
            findings_json=canonical_json(result["checks"]),
            limitations_json=canonical_json(result["limitations"]),
            manifest_json=canonical_json(result["manifest"]),
            manifest_fingerprint=result["manifest_fingerprint"],
            evaluated_at=utc_now(),
        )
        self.session.add(gate)
        self.session.commit()
        self.session.refresh(gate)
        return gate

    def candidate_gate_history(
        self, workspace_id: str, project_id: str, candidate_id: str
    ) -> list[ReleaseGateEvaluationModel]:
        self.candidate_get(workspace_id, project_id, candidate_id)
        return list(
            self.session.scalars(
                select(ReleaseGateEvaluationModel)
                .where(
                    ReleaseGateEvaluationModel.project_id == project_id,
                    ReleaseGateEvaluationModel.candidate_id == candidate_id,
                )
                .order_by(
                    ReleaseGateEvaluationModel.evaluated_at.desc(), ReleaseGateEvaluationModel.id
                )
            ).all()
        )

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
        self.candidate_get(workspace_id, project_id, candidate_id)
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

    def candidate_history(
        self, workspace_id: str, project_id: str, candidate_id: str
    ) -> list[ReleaseCandidateRevisionModel]:
        self.candidate_get(workspace_id, project_id, candidate_id)
        return list(
            self.session.scalars(
                select(ReleaseCandidateRevisionModel)
                .where(ReleaseCandidateRevisionModel.candidate_id == candidate_id)
                .order_by(ReleaseCandidateRevisionModel.revision.desc())
            ).all()
        )


def evidence_response(item: EvidenceRecordModel) -> dict[str, Any]:
    return {
        "id": item.id,
        "project_id": item.project_id,
        "feature_id": item.feature_id,
        "acceptance_criterion_id": item.acceptance_criterion_id,
        "run_id": item.run_id,
        "handoff_revision_id": item.handoff_revision_id,
        "context_package_id": item.context_package_id,
        "git_observation_id": item.git_observation_id,
        "evidence_type": item.evidence_type,
        "title": item.title,
        "description": item.description,
        "source_kind": item.source_kind,
        "source_reference": item.source_reference,
        "provenance": item.provenance,
        "declared_outcome": item.declared_outcome,
        "status": item.status,
        "version": item.version,
        "recorded_at": item.recorded_at,
        "invalidated_at": item.invalidated_at,
    }


def verification_response(
    item: VerificationEvaluationModel, *, stale: bool = False
) -> dict[str, Any]:
    return {
        "id": item.id,
        "project_id": item.project_id,
        "feature_id": item.feature_id,
        "rule_id": item.rule_id,
        "rule_version": item.rule_version,
        "subject": _json(item.subject_json),
        "inputs": _json(item.input_json),
        "input_fingerprint": item.input_fingerprint,
        "result": item.result,
        "findings": _json(item.findings_json),
        "limitations": _json(item.limitations_json),
        "evidence_ids": _json(item.evidence_ids_json),
        "verifier_version": item.verifier_version,
        "evaluated_at": item.evaluated_at,
        "stale": stale,
    }


def candidate_response(item: ReleaseCandidateModel) -> dict[str, Any]:
    return {
        "id": item.id,
        "project_id": item.project_id,
        "candidate_key": item.candidate_key,
        "title": item.title,
        "intended_version": item.intended_version,
        "description": item.description,
        "status": item.status,
        "schema_version": item.schema_version,
        "revision": item.revision,
        "content_fingerprint": item.content_fingerprint,
        "selection": _json(item.selection_json),
        "snapshot": _json(item.snapshot_json) if item.snapshot_json else None,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
        "frozen_at": item.frozen_at,
    }


def gate_response(item: ReleaseGateEvaluationModel, *, stale: bool = False) -> dict[str, Any]:
    return {
        "id": item.id,
        "project_id": item.project_id,
        "candidate_id": item.candidate_id,
        "candidate_revision": item.candidate_revision,
        "ruleset_version": item.ruleset_version,
        "input_fingerprint": item.input_fingerprint,
        "result": "STALE" if stale else item.result,
        "stored_result": item.result,
        "checks": _json(item.findings_json),
        "limitations": _json(item.limitations_json),
        "manifest": _json(item.manifest_json),
        "manifest_fingerprint": item.manifest_fingerprint,
        "evaluated_at": item.evaluated_at,
        "stale": stale,
    }


def manifest_response(item: ReleaseManifestModel) -> dict[str, Any]:
    return {
        "id": item.id,
        "project_id": item.project_id,
        "candidate_id": item.candidate_id,
        "gate_evaluation_id": item.gate_evaluation_id,
        "schema_version": item.schema_version,
        "fingerprint": item.fingerprint,
        "payload": _json(item.payload_json),
        "markdown": item.markdown,
        "created_at": item.created_at,
    }
