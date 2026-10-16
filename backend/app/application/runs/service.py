"""Application use cases for manually reported runs."""

import builtins
from datetime import datetime
from uuid import uuid4

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.application.common.errors import EntityNotFound, InvalidInput, RevisionConflict
from app.application.common.serialization import _canonical_json
from app.application.common.validation import clean_optional, clean_required, now
from app.application.planning import PlanningService
from app.application.runs.validation import _validate_output_reference
from app.persistence.models import (
    AgentRunModel,
    ContextPackageModel,
    FeatureModel,
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
_TRANSITIONS: dict[str, frozenset[str]] = {
    "PLANNED": frozenset({"IN_PROGRESS", "CANCELLED"}),
    "IN_PROGRESS": frozenset({"AWAITING_HANDOFF", "COMPLETED", "FAILED", "CANCELLED"}),
    "AWAITING_HANDOFF": frozenset({"IN_PROGRESS", "COMPLETED", "FAILED", "CANCELLED"}),
    "COMPLETED": frozenset(),
    "FAILED": frozenset(),
    "CANCELLED": frozenset(),
}


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
        validated_reference = _validate_output_reference(reference_kind, reference_value)
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
            reference_value=validated_reference,
            provenance=clean_required(provenance, "Output provenance", 5000),
        )
        self.session.add(output)
        self.session.commit()
        self.session.refresh(output)
        return output
