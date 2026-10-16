"""Application use cases for handoff drafts and published revisions."""

import builtins
from uuid import uuid4

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.application.common.errors import EntityNotFound, InvalidInput, RevisionConflict
from app.application.common.validation import now
from app.application.handoffs.serialization import (
    HANDOFF_SCHEMA,
    _canonical_json,
    _fingerprint,
    _handoff_markdown,
    _handoff_payload,
)
from app.application.planning import PlanningService
from app.application.runs.validation import clean_optional, clean_required
from app.persistence.models import (
    AgentRunModel,
    ContextPackageModel,
    HandoffAcknowledgementModel,
    HandoffModel,
    HandoffRevisionModel,
    ProjectModel,
)

HANDOFF_STATUSES = frozenset({"DRAFT", "READY", "ACKNOWLEDGED", "WITHDRAWN"})


class HandoffService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.planning = PlanningService(session)

    def _project(self, workspace_id: str, project_id: str) -> ProjectModel:
        return self.planning.project(workspace_id, project_id)

    def _writable_project(self, workspace_id: str, project_id: str) -> ProjectModel:
        return self.planning.writable_project(workspace_id, project_id)

    def _handoff(self, workspace_id: str, project_id: str, handoff_id: str) -> HandoffModel:
        self._project(workspace_id, project_id)
        item = self.session.scalar(
            select(HandoffModel).where(
                HandoffModel.id == handoff_id, HandoffModel.project_id == project_id
            )
        )
        if item is None:
            raise EntityNotFound("Handoff not found")
        return item

    def _package(self, handoff: HandoffModel) -> ContextPackageModel:
        package = self.session.get(ContextPackageModel, handoff.context_package_id)
        if (
            package is None
            or package.project_id != handoff.project_id
            or package.feature_id != handoff.feature_id
        ):
            raise EntityNotFound("Source Context Package not found")
        return package

    def list(
        self,
        workspace_id: str,
        project_id: str,
        status: str | None = None,
        search: str | None = None,
    ) -> builtins.list[HandoffModel]:
        self._project(workspace_id, project_id)
        query = select(HandoffModel).where(HandoffModel.project_id == project_id)
        if status:
            if status not in HANDOFF_STATUSES:
                raise InvalidInput("Unknown handoff status")
            query = query.where(HandoffModel.status == status)
        if search and search.strip():
            query = query.where(HandoffModel.title.ilike(f"%{search.strip()}%"))
        return builtins.list(
            self.session.scalars(
                query.order_by(HandoffModel.updated_at.desc(), HandoffModel.id.desc())
            ).all()
        )

    def create(
        self,
        workspace_id: str,
        project_id: str,
        run_id: str,
        title: str,
        summary: str | None,
        outcomes: str | None,
        blockers: str | None,
        questions: str | None,
        next_actions: str | None,
        references: str | None,
    ) -> HandoffModel:
        project = self._writable_project(workspace_id, project_id)
        run = self.session.scalar(
            select(AgentRunModel).where(
                AgentRunModel.id == run_id, AgentRunModel.project_id == project_id
            )
        )
        if run is None:
            raise EntityNotFound("Run not found")
        package = self._package_for_run(run)
        item = HandoffModel(
            id=str(uuid4()),
            project_id=project.id,
            feature_id=run.feature_id,
            run_id=run.id,
            context_package_id=package.id,
            title=clean_required(title, "Handoff title", 160),
            summary=clean_optional(summary, 10000),
            outcomes=clean_optional(outcomes, 10000),
            blockers=clean_optional(blockers, 10000),
            questions=clean_optional(questions, 10000),
            next_actions=clean_optional(next_actions, 10000),
            references=clean_optional(references, 10000),
            status="DRAFT",
            current_revision=0,
            version=1,
            created_at=now(),
            updated_at=now(),
        )
        self.session.add(item)
        self.session.commit()
        self.session.refresh(item)
        return item

    def _package_for_run(self, run: AgentRunModel) -> ContextPackageModel:
        package = self.session.scalar(
            select(ContextPackageModel).where(
                ContextPackageModel.id == run.context_package_id,
                ContextPackageModel.project_id == run.project_id,
                ContextPackageModel.feature_id == run.feature_id,
            )
        )
        if package is None:
            raise InvalidInput("The run's pinned Context Package is no longer available")
        return package

    def update_draft(
        self,
        workspace_id: str,
        project_id: str,
        handoff_id: str,
        expected_version: int,
        values: dict[str, str | None],
    ) -> HandoffModel:
        self._writable_project(workspace_id, project_id)
        item = self._handoff(workspace_id, project_id, handoff_id)
        if item.status != "DRAFT":
            raise InvalidInput("Only a draft handoff can be edited; create a correction draft")
        changes: dict[str, object] = {"updated_at": now(), "version": HandoffModel.version + 1}
        for field in (
            "title",
            "summary",
            "outcomes",
            "blockers",
            "questions",
            "next_actions",
            "references",
        ):
            if field in values:
                value = values[field]
                changes[field] = (
                    clean_required(value or "", "Handoff title", 160)
                    if field == "title"
                    else clean_optional(value, 10000)
                )
        result = self.session.execute(
            update(HandoffModel)
            .where(HandoffModel.id == item.id, HandoffModel.version == expected_version)
            .values(**changes)
        )
        if int(getattr(result, "rowcount", 0)) != 1:
            self.session.rollback()
            raise RevisionConflict("Handoff changed; reload before editing")
        self.session.commit()
        return self._handoff(workspace_id, project_id, handoff_id)

    def ready(
        self, workspace_id: str, project_id: str, handoff_id: str, expected_version: int
    ) -> HandoffModel:
        self._writable_project(workspace_id, project_id)
        item = self._handoff(workspace_id, project_id, handoff_id)
        if item.status != "DRAFT":
            raise InvalidInput("Only a draft handoff can be marked ready")
        missing = [
            label
            for label, value in (
                ("title", item.title),
                ("summary", item.summary),
                ("next_actions", item.next_actions),
            )
            if not value.strip()
        ]
        if missing:
            raise InvalidInput(
                "Handoff cannot be marked READY; missing fields: " + ", ".join(missing)
            )
        revision = item.current_revision + 1
        package = self._package(item)
        payload = _handoff_payload(item, revision, package)
        fingerprint = _fingerprint(payload)
        revision_row = HandoffRevisionModel(
            id=str(uuid4()),
            handoff_id=item.id,
            revision=revision,
            title=item.title,
            summary=item.summary,
            outcomes=item.outcomes,
            blockers=item.blockers,
            questions=item.questions,
            next_actions=item.next_actions,
            references=item.references,
            schema_version=HANDOFF_SCHEMA,
            context_package_id=package.id,
            context_fingerprint=package.fingerprint,
            fingerprint=fingerprint,
            payload_json=_canonical_json(payload),
            markdown=_handoff_markdown(payload),
        )
        result = self.session.execute(
            update(HandoffModel)
            .where(HandoffModel.id == item.id, HandoffModel.version == expected_version)
            .values(
                status="READY",
                current_revision=revision,
                ready_at=now(),
                acknowledged_at=None,
                updated_at=now(),
                version=HandoffModel.version + 1,
            )
        )
        if int(getattr(result, "rowcount", 0)) != 1:
            self.session.rollback()
            raise RevisionConflict("Handoff changed; reload before marking it ready")
        self.session.add(revision_row)
        self.session.commit()
        return self._handoff(workspace_id, project_id, handoff_id)

    def revise(
        self, workspace_id: str, project_id: str, handoff_id: str, expected_version: int
    ) -> HandoffModel:
        self._writable_project(workspace_id, project_id)
        item = self._handoff(workspace_id, project_id, handoff_id)
        if item.status not in {"READY", "ACKNOWLEDGED"}:
            raise InvalidInput("Only a published handoff can create a correction draft")
        result = self.session.execute(
            update(HandoffModel)
            .where(HandoffModel.id == item.id, HandoffModel.version == expected_version)
            .values(
                status="DRAFT",
                acknowledged_at=None,
                updated_at=now(),
                version=HandoffModel.version + 1,
            )
        )
        if int(getattr(result, "rowcount", 0)) != 1:
            self.session.rollback()
            raise RevisionConflict("Handoff changed; reload before creating a correction")
        self.session.commit()
        return self._handoff(workspace_id, project_id, handoff_id)

    def acknowledge(
        self,
        workspace_id: str,
        project_id: str,
        handoff_id: str,
        expected_revision: int,
        acknowledged_by: str | None,
    ) -> HandoffAcknowledgementModel:
        self._writable_project(workspace_id, project_id)
        item = self._handoff(workspace_id, project_id, handoff_id)
        if item.status == "WITHDRAWN":
            raise InvalidInput("A withdrawn handoff cannot be acknowledged")
        if item.status == "ACKNOWLEDGED" and item.current_revision == expected_revision:
            existing = self.session.scalar(
                select(HandoffAcknowledgementModel).where(
                    HandoffAcknowledgementModel.handoff_id == item.id,
                    HandoffAcknowledgementModel.revision == expected_revision,
                )
            )
            if existing is not None:
                return existing
        if item.status != "READY" or item.current_revision != expected_revision:
            raise RevisionConflict("This handoff revision is stale; reload the published handoff")
        revision = self.session.scalar(
            select(HandoffRevisionModel).where(
                HandoffRevisionModel.handoff_id == item.id,
                HandoffRevisionModel.revision == expected_revision,
            )
        )
        if revision is None:
            raise EntityNotFound("Handoff revision not found")
        result = self.session.execute(
            update(HandoffModel)
            .where(
                HandoffModel.id == item.id,
                HandoffModel.status == "READY",
                HandoffModel.current_revision == expected_revision,
            )
            .values(
                status="ACKNOWLEDGED",
                acknowledged_at=now(),
                updated_at=now(),
                version=HandoffModel.version + 1,
            )
        )
        if int(getattr(result, "rowcount", 0)) != 1:
            self.session.rollback()
            raise RevisionConflict("Handoff changed; reload before acknowledging")
        acknowledgement = HandoffAcknowledgementModel(
            id=str(uuid4()),
            handoff_id=item.id,
            revision=expected_revision,
            acknowledged_by=clean_optional(acknowledged_by, 120) or None,
            acknowledged_at=now(),
        )
        self.session.add(acknowledgement)
        try:
            self.session.commit()
        except IntegrityError as exc:
            self.session.rollback()
            raise RevisionConflict("Handoff changed; reload before acknowledging") from exc
        self.session.refresh(acknowledgement)
        return acknowledgement

    def withdraw(
        self, workspace_id: str, project_id: str, handoff_id: str, expected_version: int
    ) -> HandoffModel:
        self._writable_project(workspace_id, project_id)
        item = self._handoff(workspace_id, project_id, handoff_id)
        if item.status not in {"DRAFT", "READY"}:
            raise InvalidInput("Only draft or ready handoffs can be withdrawn")
        result = self.session.execute(
            update(HandoffModel)
            .where(HandoffModel.id == item.id, HandoffModel.version == expected_version)
            .values(
                status="WITHDRAWN",
                withdrawn_at=now(),
                updated_at=now(),
                version=HandoffModel.version + 1,
            )
        )
        if int(getattr(result, "rowcount", 0)) != 1:
            self.session.rollback()
            raise RevisionConflict("Handoff changed; reload before withdrawing")
        self.session.commit()
        return self._handoff(workspace_id, project_id, handoff_id)

    def revisions(
        self, workspace_id: str, project_id: str, handoff_id: str
    ) -> builtins.list[HandoffRevisionModel]:
        item = self._handoff(workspace_id, project_id, handoff_id)
        return builtins.list(
            self.session.scalars(
                select(HandoffRevisionModel)
                .where(HandoffRevisionModel.handoff_id == item.id)
                .order_by(HandoffRevisionModel.revision.desc())
            ).all()
        )

    def get_revision(
        self, workspace_id: str, project_id: str, handoff_id: str, revision: int
    ) -> HandoffRevisionModel:
        item = self._handoff(workspace_id, project_id, handoff_id)
        result = self.session.scalar(
            select(HandoffRevisionModel).where(
                HandoffRevisionModel.handoff_id == item.id,
                HandoffRevisionModel.revision == revision,
            )
        )
        if result is None:
            raise EntityNotFound("Handoff revision not found")
        return result
