"""Application services for manually reported runs and handoffs.

FND-05 records work; it never starts an agent, executes a command, reads a
repository, or turns a report into verification evidence.
"""

import builtins
import hashlib
import html
import json
from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.application.services import EntityNotFound, InvalidInput, PlanningService, RevisionConflict
from app.persistence.models import (
    AgentRunModel,
    ContextPackageModel,
    FeatureModel,
    HandoffAcknowledgementModel,
    HandoffModel,
    HandoffRevisionModel,
    ProjectModel,
    RunEventModel,
    RunOutputReferenceModel,
)

RUN_STATUSES = frozenset(
    {"PLANNED", "IN_PROGRESS", "AWAITING_HANDOFF", "COMPLETED", "FAILED", "CANCELLED"}
)
RUN_EVENT_TYPES = frozenset(
    {
        "progress",
        "blocker",
        "decision_note",
        "output_reported",
        "status_changed",
        "correction",
        "general_note",
    }
)
HANDOFF_STATUSES = frozenset({"DRAFT", "READY", "ACKNOWLEDGED", "WITHDRAWN"})
HANDOFF_SCHEMA = "forge-handoff-v1"

_TRANSITIONS: dict[str, frozenset[str]] = {
    "PLANNED": frozenset({"IN_PROGRESS", "CANCELLED"}),
    "IN_PROGRESS": frozenset({"AWAITING_HANDOFF", "COMPLETED", "FAILED", "CANCELLED"}),
    "AWAITING_HANDOFF": frozenset({"IN_PROGRESS", "COMPLETED", "FAILED", "CANCELLED"}),
    "COMPLETED": frozenset(),
    "FAILED": frozenset(),
    "CANCELLED": frozenset(),
}


def now() -> datetime:
    return datetime.now(UTC)


def clean_required(value: str, label: str, limit: int) -> str:
    clean = value.strip()
    if not clean:
        raise InvalidInput(f"{label} is required")
    if len(clean) > limit:
        raise InvalidInput(f"{label} must be {limit} characters or fewer")
    return clean


def clean_optional(value: str | None, limit: int) -> str:
    if value is None:
        return ""
    clean = value.strip()
    if len(clean) > limit:
        raise InvalidInput(f"Text must be {limit} characters or fewer")
    return clean


def _canonical_json(payload: dict[str, object]) -> str:
    return json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _fingerprint(payload: dict[str, object]) -> str:
    return hashlib.sha256(_canonical_json(payload).encode("utf-8")).hexdigest()


def _markdown_value(value: str) -> str:
    return html.escape(value, quote=False).replace("\r\n", "\n").replace("\r", "\n")


def _handoff_payload(
    handoff: HandoffModel, revision: int, package: ContextPackageModel
) -> dict[str, object]:
    return {
        "schema": HANDOFF_SCHEMA,
        "handoff_id": handoff.id,
        "revision": revision,
        "project_id": handoff.project_id,
        "feature_id": handoff.feature_id,
        "run_id": handoff.run_id,
        "source_context": {
            "package_id": package.id,
            "schema_version": package.schema_version,
            "fingerprint": package.fingerprint,
        },
        "content": {
            "title": handoff.title,
            "summary": handoff.summary,
            "outcomes": handoff.outcomes,
            "blockers": handoff.blockers,
            "questions": handoff.questions,
            "next_actions": handoff.next_actions,
            "references": handoff.references,
        },
        "provenance": {
            "origin": "manual",
            "reported": True,
            "observed": False,
            "verified": False,
        },
    }


def _handoff_markdown(payload: dict[str, object]) -> str:
    content = payload["content"]
    assert isinstance(content, dict)
    source = payload["source_context"]
    assert isinstance(source, dict)
    lines = [
        f"# {_markdown_value(str(content['title']))}",
        "",
        f"- Schema: `{_markdown_value(str(payload['schema']))}`",
        f"- Handoff: `{_markdown_value(str(payload['handoff_id']))}`",
        f"- Revision: `{_markdown_value(str(payload['revision']))}`",
        f"- Run: `{_markdown_value(str(payload['run_id']))}`",
        f"- Context package: `{_markdown_value(str(source['package_id']))}`",
        f"- Context fingerprint: `{_markdown_value(str(source['fingerprint']))}`",
        "",
        "## Summary",
        "",
        f"<pre>{_markdown_value(str(content['summary']))}</pre>",
        "",
        "## Reported outcomes",
        "",
        f"<pre>{_markdown_value(str(content['outcomes']))}</pre>",
        "",
        "## Blockers",
        "",
        f"<pre>{_markdown_value(str(content['blockers']))}</pre>",
        "",
        "## Open questions",
        "",
        f"<pre>{_markdown_value(str(content['questions']))}</pre>",
        "",
        "## Next actions",
        "",
        f"<pre>{_markdown_value(str(content['next_actions']))}</pre>",
        "",
        "## References",
        "",
        f"<pre>{_markdown_value(str(content['references']))}</pre>",
        "",
        "> Reported context only. This handoff is not proof of implementation, tests, CI, "
        "or release correctness.",
        "",
    ]
    return "\n".join(lines)


class RunService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.planning = PlanningService(session)

    def _project(self, workspace_id: str, project_id: str) -> ProjectModel:
        return self.planning.project(workspace_id, project_id)

    def _writable_project(self, workspace_id: str, project_id: str) -> ProjectModel:
        return self.planning.writable_project(workspace_id, project_id)

    def _run(self, workspace_id: str, project_id: str, run_id: str) -> AgentRunModel:
        self._project(workspace_id, project_id)
        run = self.session.scalar(
            select(AgentRunModel).where(
                AgentRunModel.id == run_id, AgentRunModel.project_id == project_id
            )
        )
        if run is None:
            raise EntityNotFound("Run not found")
        return run

    def list(
        self,
        workspace_id: str,
        project_id: str | None = None,
        feature_id: str | None = None,
        status: str | None = None,
        search: str | None = None,
    ) -> builtins.list[AgentRunModel]:
        self._project(workspace_id, project_id) if project_id else None
        query = (
            select(AgentRunModel)
            .join(ProjectModel, ProjectModel.id == AgentRunModel.project_id)
            .where(ProjectModel.workspace_id == workspace_id)
        )
        if project_id:
            query = query.where(AgentRunModel.project_id == project_id)
        if feature_id:
            query = query.where(AgentRunModel.feature_id == feature_id)
        if status:
            if status not in RUN_STATUSES:
                raise InvalidInput("Unknown run status")
            query = query.where(AgentRunModel.status == status)
        if search and search.strip():
            term = f"%{search.strip()}%"
            query = query.where(AgentRunModel.title.ilike(term))
        return builtins.list(
            self.session.scalars(
                query.order_by(AgentRunModel.updated_at.desc(), AgentRunModel.id.desc())
            ).all()
        )

    def create(
        self,
        workspace_id: str,
        project_id: str,
        feature_id: str,
        context_package_id: str,
        title: str,
        description: str | None,
        execution_mode: str,
        executor_type: str,
        executor_label: str | None,
    ) -> AgentRunModel:
        project = self._writable_project(workspace_id, project_id)
        planning_feature = self.session.scalar(
            select(FeatureModel).where(
                FeatureModel.id == feature_id,
                FeatureModel.project_id == project_id,
            )
        )
        if planning_feature is None:
            raise EntityNotFound("Feature not found")
        package = self.session.scalar(
            select(ContextPackageModel).where(
                ContextPackageModel.id == context_package_id,
                ContextPackageModel.project_id == project_id,
                ContextPackageModel.feature_id == feature_id,
            )
        )
        if package is None:
            raise InvalidInput("Select a saved Context Package for this Feature")
        clean_mode = clean_required(execution_mode, "Execution mode", 20).lower()
        if clean_mode != "manual":
            raise InvalidInput("FND-05 only records manual reports")
        clean_type = clean_required(executor_type, "Executor type", 40).lower()
        if clean_type not in {"human", "external_agent", "unknown"}:
            raise InvalidInput("Executor type is not supported")
        run = AgentRunModel(
            id=str(uuid4()),
            project_id=project.id,
            feature_id=feature_id,
            context_package_id=package.id,
            context_schema_version=package.schema_version,
            context_fingerprint=package.fingerprint,
            title=clean_required(title, "Run title", 160),
            description=clean_optional(description, 5000),
            execution_mode=clean_mode,
            executor_type=clean_type,
            executor_label=clean_optional(executor_label, 160) or None,
            status="PLANNED",
            version=1,
            created_at=now(),
            updated_at=now(),
        )
        self.session.add(run)
        self.session.flush()
        self.session.add(
            RunEventModel(
                id=str(uuid4()),
                run_id=run.id,
                event_type="status_changed",
                title="Run recorded",
                description="The run was recorded as a manual planning report.",
                origin="manual",
                payload_json=_canonical_json({"from": None, "to": "PLANNED"}),
            )
        )
        self.session.commit()
        self.session.refresh(run)
        return run

    def change_status(
        self,
        workspace_id: str,
        project_id: str,
        run_id: str,
        target: str,
        expected_version: int,
    ) -> AgentRunModel:
        self._writable_project(workspace_id, project_id)
        run = self._run(workspace_id, project_id, run_id)
        target = target.upper()
        if target not in RUN_STATUSES:
            raise InvalidInput("Unknown run status")
        if target not in _TRANSITIONS[run.status]:
            raise InvalidInput(f"Cannot move run from {run.status} to {target}")
        timestamp = now()
        values: dict[str, object] = {
            "status": target,
            "updated_at": timestamp,
            "version": AgentRunModel.version + 1,
        }
        if target == "IN_PROGRESS" and run.started_at is None:
            values["started_at"] = timestamp
        if target in {"COMPLETED", "FAILED", "CANCELLED"}:
            values["finished_at"] = timestamp
        result = self.session.execute(
            update(AgentRunModel)
            .where(AgentRunModel.id == run.id, AgentRunModel.version == expected_version)
            .values(**values)
        )
        if int(getattr(result, "rowcount", 0)) != 1:
            self.session.rollback()
            raise RevisionConflict("Run changed; reload before updating its status")
        self.session.add(
            RunEventModel(
                id=str(uuid4()),
                run_id=run.id,
                event_type="status_changed",
                title=f"Status changed to {target}",
                description=f"The reported run moved from {run.status} to {target}.",
                origin="manual",
                payload_json=_canonical_json({"from": run.status, "to": target}),
            )
        )
        self.session.commit()
        return self._run(workspace_id, project_id, run_id)

    def events(
        self, workspace_id: str, project_id: str, run_id: str
    ) -> builtins.list[RunEventModel]:
        run = self._run(workspace_id, project_id, run_id)
        return builtins.list(
            self.session.scalars(
                select(RunEventModel)
                .where(RunEventModel.run_id == run.id)
                .order_by(RunEventModel.recorded_at.asc(), RunEventModel.id.asc())
            ).all()
        )

    def add_event(
        self,
        workspace_id: str,
        project_id: str,
        run_id: str,
        event_type: str,
        title: str,
        description: str,
        expected_version: int,
        occurred_at: datetime | None,
        supersedes_event_id: str | None,
    ) -> RunEventModel:
        self._writable_project(workspace_id, project_id)
        run = self._run(workspace_id, project_id, run_id)
        if event_type not in RUN_EVENT_TYPES or event_type == "status_changed":
            raise InvalidInput("Event type is not valid for a manual report")
        supersedes = None
        if supersedes_event_id:
            supersedes = self.session.scalar(
                select(RunEventModel).where(
                    RunEventModel.id == supersedes_event_id, RunEventModel.run_id == run.id
                )
            )
            if supersedes is None:
                raise EntityNotFound("Event to correct was not found")
            event_type = "correction"
        result = self.session.execute(
            update(AgentRunModel)
            .where(AgentRunModel.id == run.id, AgentRunModel.version == expected_version)
            .values(version=AgentRunModel.version + 1, updated_at=now())
        )
        if int(getattr(result, "rowcount", 0)) != 1:
            self.session.rollback()
            raise RevisionConflict("Run changed; reload before adding an event")
        event = RunEventModel(
            id=str(uuid4()),
            run_id=run.id,
            event_type=event_type,
            title=clean_required(title, "Event title", 160),
            description=clean_required(description, "Event description", 10000),
            origin="manual",
            occurred_at=occurred_at,
            supersedes_event_id=supersedes.id if supersedes else None,
            payload_json="{}",
        )
        self.session.add(event)
        self.session.commit()
        self.session.refresh(event)
        return event

    def outputs(
        self, workspace_id: str, project_id: str, run_id: str
    ) -> builtins.list[RunOutputReferenceModel]:
        run = self._run(workspace_id, project_id, run_id)
        return builtins.list(
            self.session.scalars(
                select(RunOutputReferenceModel)
                .where(RunOutputReferenceModel.run_id == run.id)
                .order_by(
                    RunOutputReferenceModel.created_at.asc(), RunOutputReferenceModel.id.asc()
                )
            ).all()
        )

    def add_output(
        self,
        workspace_id: str,
        project_id: str,
        run_id: str,
        label: str,
        summary: str,
        reference_kind: str,
        reference_value: str | None,
        provenance: str,
        expected_version: int,
    ) -> RunOutputReferenceModel:
        self._writable_project(workspace_id, project_id)
        run = self._run(workspace_id, project_id, run_id)
        allowed_kinds = {"label", "safe_link", "commit", "artifact"}
        if reference_kind not in allowed_kinds:
            raise InvalidInput("Output reference kind is not supported")
        if reference_value and ("\\" in reference_value or reference_value.startswith("/")):
            raise InvalidInput("Filesystem paths are not accepted as output references")
        result = self.session.execute(
            update(AgentRunModel)
            .where(AgentRunModel.id == run.id, AgentRunModel.version == expected_version)
            .values(version=AgentRunModel.version + 1, updated_at=now())
        )
        if int(getattr(result, "rowcount", 0)) != 1:
            self.session.rollback()
            raise RevisionConflict("Run changed; reload before adding an output")
        output = RunOutputReferenceModel(
            id=str(uuid4()),
            run_id=run.id,
            label=clean_required(label, "Output label", 160),
            summary=clean_required(summary, "Output summary", 10000),
            reference_kind=reference_kind,
            reference_value=clean_optional(reference_value, 500) or None,
            provenance=clean_required(provenance, "Output provenance", 5000),
        )
        self.session.add(output)
        self.session.commit()
        self.session.refresh(output)
        return output


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
