import hashlib
import json
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import cast

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.entities import FeatureStatus, ReadinessOutcome
from app.persistence.models import (
    AcceptanceCriterionModel,
    DecisionFeatureLinkModel,
    DecisionModel,
    FeatureDependencyModel,
    FeatureModel,
    InvariantAcknowledgementModel,
    InvariantModel,
    ProjectModel,
)

RULE_SET_VERSION = "fnd03-v1"
RULE_VERSION = "1.0"


@dataclass(frozen=True, slots=True)
class ReadinessEvaluation:
    feature_id: str
    evaluated_at: datetime
    rule_set_version: str
    input_fingerprint: str
    outcome: ReadinessOutcome
    passed_checks: list[str]
    failed_checks: list[str]
    blockers: list[dict[str, object]]
    results: list[dict[str, object]]
    input_snapshot: dict[str, object]


class ReadinessEngine:
    """Deterministic planning-readiness rules with no framework or provider dependencies."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def evaluate(self, project: ProjectModel, feature: FeatureModel) -> ReadinessEvaluation:
        inputs = self._inputs(project, feature)
        fingerprint = self._fingerprint(inputs)
        results = [
            self._definition_rule(feature),
            self._criteria_rule(inputs["criteria"]),
            self._dependency_rule(inputs["dependencies"]),
            self._decision_rule(inputs["decisions"]),
            self._invariant_rule(inputs["invariants"]),
            self._availability_rule(project),
        ]
        blockers = [
            blocker
            for result in results
            for blocker in cast(list[dict[str, object]], result["blockers"])
        ]
        passed = [str(result["rule_id"]) for result in results if result["result"] == "passed"]
        failed = [str(result["rule_id"]) for result in results if result["result"] == "failed"]
        outcome = ReadinessOutcome.READY_TO_START if not failed else ReadinessOutcome.NOT_READY
        return ReadinessEvaluation(
            feature_id=feature.id,
            evaluated_at=datetime.now(UTC),
            rule_set_version=RULE_SET_VERSION,
            input_fingerprint=fingerprint,
            outcome=outcome,
            passed_checks=passed,
            failed_checks=failed,
            blockers=blockers,
            results=results,
            input_snapshot=inputs,
        )

    def fingerprint(self, project: ProjectModel, feature: FeatureModel) -> str:
        return self._fingerprint(self._inputs(project, feature))

    def _inputs(self, project: ProjectModel, feature: FeatureModel) -> dict[str, object]:
        criteria = list(
            self.session.scalars(
                select(AcceptanceCriterionModel)
                .where(AcceptanceCriterionModel.feature_id == feature.id)
                .order_by(AcceptanceCriterionModel.position, AcceptanceCriterionModel.id)
            ).all()
        )
        dependencies = list(
            self.session.execute(
                select(FeatureDependencyModel, FeatureModel)
                .join(FeatureModel, FeatureModel.id == FeatureDependencyModel.blocking_feature_id)
                .where(
                    FeatureDependencyModel.project_id == project.id,
                    FeatureDependencyModel.blocked_feature_id == feature.id,
                )
                .order_by(
                    FeatureDependencyModel.blocking_feature_id,
                    FeatureDependencyModel.blocked_feature_id,
                    FeatureDependencyModel.id,
                )
            ).all()
        )
        decisions = list(
            self.session.scalars(
                select(DecisionModel)
                .join(
                    DecisionFeatureLinkModel,
                    DecisionFeatureLinkModel.decision_id == DecisionModel.id,
                )
                .where(
                    DecisionFeatureLinkModel.feature_id == feature.id,
                    DecisionModel.project_id == project.id,
                )
                .order_by(DecisionModel.id)
            ).all()
        )
        invariants = list(
            self.session.scalars(
                select(InvariantModel)
                .where(
                    InvariantModel.project_id == project.id,
                    InvariantModel.status == "active",
                    (
                        InvariantModel.feature_id.is_(None)
                        | (InvariantModel.feature_id == feature.id)
                    ),
                )
                .order_by(InvariantModel.id)
            ).all()
        )
        acknowledgements = {
            item.invariant_id: item
            for item in self.session.scalars(
                select(InvariantAcknowledgementModel).where(
                    InvariantAcknowledgementModel.feature_id == feature.id,
                    InvariantAcknowledgementModel.invariant_id.in_(
                        [item.id for item in invariants]
                    ),
                )
            ).all()
        }
        return {
            "feature": {
                "id": feature.id,
                "key": feature.readable_id,
                "title": feature.title.strip(),
                "goal": (feature.goal or "").strip(),
                "description": (feature.description or "").strip(),
                "status": feature.status,
            },
            "project": {"id": project.id, "status": project.status},
            "criteria": [
                {
                    "id": item.id,
                    "description": item.description.strip(),
                    "satisfied": item.satisfied,
                    "position": item.position,
                }
                for item in criteria
            ],
            "dependencies": [
                {
                    "id": dependency.id,
                    "blocking_feature_id": dependency.blocking_feature_id,
                    "blocking_key": blocking.readable_id,
                    "blocking_title": blocking.title,
                    "blocking_status": blocking.status,
                }
                for dependency, blocking in dependencies
            ],
            "decisions": [self._decision_input(item) for item in decisions],
            "invariants": [
                {
                    "id": item.id,
                    "title": item.title,
                    "statement": item.statement,
                    "rationale": item.rationale,
                    "scope": "project" if item.feature_id is None else "feature",
                    "feature_id": item.feature_id,
                    "revision": item.revision,
                    "acknowledged_revision": (
                        acknowledgements[item.id].acknowledged_revision
                        if item.id in acknowledgements
                        else None
                    ),
                }
                for item in invariants
            ],
        }

    def _decision_input(self, decision: DecisionModel) -> dict[str, object]:
        current = decision
        visited: set[str] = set()
        valid_chain = True
        chain: list[dict[str, object]] = []
        while current.status == "superseded":
            chain.append(self._decision_snapshot(current))
            if current.id in visited or current.superseded_by_id is None:
                valid_chain = False
                break
            visited.add(current.id)
            successor = self.session.scalar(
                select(DecisionModel).where(
                    DecisionModel.id == current.superseded_by_id,
                    DecisionModel.project_id == decision.project_id,
                )
            )
            if successor is None:
                valid_chain = False
                break
            current = successor
        if valid_chain:
            chain.append(self._decision_snapshot(current))
        return {
            "id": decision.id,
            **self._decision_snapshot(decision),
            "supersession_chain": chain,
            "effective_id": current.id if valid_chain else None,
            "effective_status": current.status if valid_chain else "invalid",
            "effective": self._decision_snapshot(current) if valid_chain else None,
        }

    @staticmethod
    def _decision_snapshot(decision: DecisionModel) -> dict[str, object]:
        return {
            "id": decision.id,
            "title": decision.title,
            "context": decision.context,
            "decision": decision.decision,
            "rationale": decision.rationale,
            "alternatives_considered": decision.alternatives_considered,
            "tradeoffs": decision.tradeoffs,
            "status": decision.status,
            "revision": decision.revision,
            "superseded_by_id": decision.superseded_by_id,
        }

    @staticmethod
    def _fingerprint(inputs: dict[str, object]) -> str:
        canonical_inputs = dict(inputs)
        dependencies = cast(list[dict[str, object]], inputs.get("dependencies", []))
        canonical_inputs["dependencies"] = sorted(
            dependencies,
            key=lambda item: (
                str(item.get("blocking_feature_id", "")),
                str(item.get("blocked_feature_id", "")),
                str(item.get("id", "")),
            ),
        )
        payload = json.dumps(
            {"rule_set_version": RULE_SET_VERSION, "inputs": canonical_inputs},
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=True,
        ).encode("utf-8")
        return hashlib.sha256(payload).hexdigest()

    @staticmethod
    def _reference(kind: str, record_id: str, label: str | None = None) -> dict[str, object]:
        value: dict[str, object] = {"kind": kind, "id": record_id}
        if label is not None:
            value["label"] = label
        return value

    @classmethod
    def _result(
        cls,
        rule_id: str,
        result: str,
        explanation: str,
        blockers: list[dict[str, object]] | None = None,
        references: list[dict[str, object]] | None = None,
    ) -> dict[str, object]:
        return {
            "rule_id": rule_id,
            "rule_version": RULE_VERSION,
            "result": result,
            "explanation": explanation,
            "blockers": blockers or [],
            "references": references or [],
        }

    @classmethod
    def _blocker(
        cls, code: str, message: str, references: list[dict[str, object]]
    ) -> dict[str, object]:
        return {"code": code, "message": message, "references": references}

    @classmethod
    def _definition_rule(cls, feature: FeatureModel) -> dict[str, object]:
        blockers: list[dict[str, object]] = []
        if not feature.title.strip():
            blockers.append(
                cls._blocker(
                    "R01_TITLE",
                    "Add a useful feature title.",
                    [cls._reference("feature", feature.id)],
                )
            )
        if not (feature.goal or "").strip():
            blockers.append(
                cls._blocker(
                    "R01_GOAL",
                    "Describe the functional goal before starting implementation.",
                    [cls._reference("feature", feature.id)],
                )
            )
        return cls._result(
            "R01",
            "failed" if blockers else "passed",
            "Feature title and functional goal are defined."
            if not blockers
            else "The feature definition needs more context.",
            blockers,
            [cls._reference("feature", feature.id, feature.readable_id)],
        )

    @classmethod
    def _criteria_rule(cls, criteria: object) -> dict[str, object]:
        items = cast(list[dict[str, object]], criteria)
        blockers: list[dict[str, object]] = []
        if not items:
            blockers.append(
                cls._blocker("R02_MISSING", "Add at least one acceptance criterion.", [])
            )
        for item in items:
            if not str(item["description"]).strip():
                blockers.append(
                    cls._blocker(
                        "R02_DESCRIPTION",
                        "Every acceptance criterion needs a description.",
                        [cls._reference("acceptance_criterion", str(item["id"]))],
                    )
                )
        return cls._result(
            "R02",
            "failed" if blockers else "passed",
            "Acceptance criteria describe the expected behavior; satisfied is not required "
            "for planning readiness."
            if not blockers
            else "Add clear acceptance criteria. Their manual satisfied state is "
            "not used as proof.",
            blockers,
            [cls._reference("acceptance_criterion", str(item["id"])) for item in items],
        )

    @classmethod
    def _dependency_rule(cls, dependencies: object) -> dict[str, object]:
        items = cast(list[dict[str, object]], dependencies)
        pending = [item for item in items if item["blocking_status"] != FeatureStatus.DONE.value]
        blockers = [
            cls._blocker(
                "R03_PENDING_DEPENDENCY",
                f"{item['blocking_key']} must be DONE before this feature can start.",
                [
                    cls._reference(
                        "feature", str(item["blocking_feature_id"]), str(item["blocking_key"])
                    )
                ],
            )
            for item in pending
        ]
        explanation = (
            "Blocking features are DONE by manual planning declaration; no technical "
            "evidence was checked."
            if items and not pending
            else "All blocking features are clear."
            if not items
            else "One or more blocking features are still pending."
        )
        return cls._result(
            "R03",
            "failed" if blockers else "passed",
            explanation,
            blockers,
            [
                cls._reference(
                    "feature", str(item["blocking_feature_id"]), str(item["blocking_key"])
                )
                for item in items
            ],
        )

    @classmethod
    def _decision_rule(cls, decisions: object) -> dict[str, object]:
        items = cast(list[dict[str, object]], decisions)
        blockers: list[dict[str, object]] = []
        for item in items:
            if item["effective_status"] != "accepted":
                blockers.append(
                    cls._blocker(
                        "R04_DECISION_NOT_ACCEPTED",
                        f"Decision '{item['title']}' needs to be accepted or replaced by "
                        "an accepted successor.",
                        [cls._reference("decision", str(item["id"]), str(item["title"]))],
                    )
                )
        return cls._result(
            "R04",
            "failed" if blockers else "passed",
            "Linked decisions are accepted."
            if items and not blockers
            else "No linked decisions are blocking readiness."
            if not items
            else "Resolve the linked decisions before starting.",
            blockers,
            [cls._reference("decision", str(item["id"]), str(item["title"])) for item in items],
        )

    @classmethod
    def _invariant_rule(cls, invariants: object) -> dict[str, object]:
        items = cast(list[dict[str, object]], invariants)
        blockers: list[dict[str, object]] = []
        for item in items:
            if item["acknowledged_revision"] != item["revision"]:
                blockers.append(
                    cls._blocker(
                        "R05_ACKNOWLEDGEMENT_REQUIRED",
                        f"Review invariant '{item['title']}' at revision {item['revision']}.",
                        [cls._reference("invariant", str(item["id"]), str(item["title"]))],
                    )
                )
        return cls._result(
            "R05",
            "failed" if blockers else "passed",
            "All applicable invariants have current acknowledgements; acknowledgement "
            "means reviewed, not technically compliant."
            if items and not blockers
            else "No active invariants apply to this feature."
            if not items
            else "Review the applicable invariants before starting.",
            blockers,
            [cls._reference("invariant", str(item["id"]), str(item["title"])) for item in items],
        )

    @classmethod
    def _availability_rule(cls, project: ProjectModel) -> dict[str, object]:
        archived = project.status == "archived"
        blocker = (
            cls._blocker(
                "R06_ARCHIVED_PROJECT",
                "Restore the archived project before starting new development.",
                [cls._reference("project", project.id, project.name)],
            )
            if archived
            else None
        )
        return cls._result(
            "R06",
            "failed" if archived else "passed",
            "The project is active."
            if not archived
            else "The project is archived and is read-only.",
            [blocker] if blocker else [],
            [cls._reference("project", project.id, project.name)],
        )
