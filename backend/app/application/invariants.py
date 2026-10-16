from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.application.common.errors import (
    DuplicateName,
    EntityNotFound,
    InvalidInput,
    RevisionConflict,
)
from app.application.common.validation import clean_text, clean_title, now
from app.domain.entities import InvariantStatus
from app.persistence.models import (
    FeatureModel,
    InvariantAcknowledgementModel,
    InvariantModel,
    InvariantRevisionModel,
    ProjectModel,
)
from app.persistence.repositories import ProjectRepository


class InvariantService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.projects = ProjectRepository(session)

    def _project(self, workspace_id: str, project_id: str, writable: bool = False) -> ProjectModel:
        project = self.projects.get(workspace_id, project_id)
        if project is None:
            raise EntityNotFound("Project not found")
        if writable and project.status == "archived":
            raise InvalidInput("Archived projects are read-only")
        return project

    def _invariant(self, project_id: str, invariant_id: str) -> InvariantModel:
        invariant = self.session.scalar(
            select(InvariantModel).where(
                InvariantModel.id == invariant_id, InvariantModel.project_id == project_id
            )
        )
        if invariant is None:
            raise EntityNotFound("Invariant not found")
        return invariant

    def _feature(self, project_id: str, feature_id: str) -> FeatureModel:
        feature = self.session.scalar(
            select(FeatureModel).where(
                FeatureModel.id == feature_id, FeatureModel.project_id == project_id
            )
        )
        if feature is None:
            raise EntityNotFound("Feature not found")
        return feature

    @staticmethod
    def _snapshot(invariant: InvariantModel) -> InvariantRevisionModel:
        return InvariantRevisionModel(
            invariant_id=invariant.id,
            revision=invariant.revision,
            title=invariant.title,
            statement=invariant.statement,
            rationale=invariant.rationale,
            status=invariant.status,
            feature_id=invariant.feature_id,
        )

    def list_invariants(
        self, workspace_id: str, project_id: str, include_retired: bool = True
    ) -> list[InvariantModel]:
        self._project(workspace_id, project_id)
        query = select(InvariantModel).where(InvariantModel.project_id == project_id)
        if not include_retired:
            query = query.where(InvariantModel.status == InvariantStatus.ACTIVE.value)
        return list(
            self.session.scalars(
                query.order_by(InvariantModel.updated_at.desc(), InvariantModel.title)
            ).all()
        )

    def get(self, workspace_id: str, project_id: str, invariant_id: str) -> InvariantModel:
        self._project(workspace_id, project_id)
        return self._invariant(project_id, invariant_id)

    def create(
        self,
        workspace_id: str,
        project_id: str,
        title: str,
        statement: str,
        rationale: str,
        feature_id: str | None,
    ) -> InvariantModel:
        self._project(workspace_id, project_id, writable=True)
        if feature_id is not None:
            self._feature(project_id, feature_id)
        invariant = InvariantModel(
            project_id=project_id,
            feature_id=feature_id,
            title=clean_title(title),
            statement=self._required_text(statement, "Statement"),
            rationale=self._required_text(rationale, "Rationale"),
            status=InvariantStatus.ACTIVE.value,
        )
        self.session.add(invariant)
        self.session.flush()
        self.session.add(self._snapshot(invariant))
        self.session.commit()
        self.session.refresh(invariant)
        return invariant

    def update(
        self,
        workspace_id: str,
        project_id: str,
        invariant_id: str,
        title: str | None,
        statement: str | None,
        rationale: str | None,
    ) -> InvariantModel:
        self._project(workspace_id, project_id, writable=True)
        invariant = self._invariant(project_id, invariant_id)
        if invariant.status == InvariantStatus.RETIRED.value:
            raise InvalidInput("Retired invariants cannot be edited")
        if title is not None:
            invariant.title = clean_title(title)
        if statement is not None:
            invariant.statement = self._required_text(statement, "Statement")
        if rationale is not None:
            invariant.rationale = self._required_text(rationale, "Rationale")
        invariant.revision += 1
        invariant.updated_at = now()
        self.session.flush()
        self.session.add(self._snapshot(invariant))
        self.session.commit()
        self.session.refresh(invariant)
        return invariant

    def retire(self, workspace_id: str, project_id: str, invariant_id: str) -> InvariantModel:
        self._project(workspace_id, project_id, writable=True)
        invariant = self._invariant(project_id, invariant_id)
        if invariant.status != InvariantStatus.RETIRED.value:
            invariant.status = InvariantStatus.RETIRED.value
            invariant.revision += 1
            invariant.updated_at = now()
            self.session.flush()
            self.session.add(self._snapshot(invariant))
            self.session.commit()
            self.session.refresh(invariant)
        return invariant

    def revisions(
        self, workspace_id: str, project_id: str, invariant_id: str
    ) -> list[InvariantRevisionModel]:
        self._project(workspace_id, project_id)
        invariant = self._invariant(project_id, invariant_id)
        return list(
            self.session.scalars(
                select(InvariantRevisionModel)
                .where(InvariantRevisionModel.invariant_id == invariant.id)
                .order_by(InvariantRevisionModel.revision.desc())
            ).all()
        )

    def applicable(
        self, workspace_id: str, project_id: str, feature_id: str
    ) -> list[tuple[InvariantModel, InvariantAcknowledgementModel | None]]:
        self._project(workspace_id, project_id)
        self._feature(project_id, feature_id)
        invariants = list(
            self.session.scalars(
                select(InvariantModel)
                .where(
                    InvariantModel.project_id == project_id,
                    InvariantModel.status == InvariantStatus.ACTIVE.value,
                    (
                        InvariantModel.feature_id.is_(None)
                        | (InvariantModel.feature_id == feature_id)
                    ),
                )
                .order_by(InvariantModel.feature_id, InvariantModel.updated_at.desc())
            ).all()
        )
        acknowledgements = {
            item.invariant_id: item
            for item in self.session.scalars(
                select(InvariantAcknowledgementModel).where(
                    InvariantAcknowledgementModel.feature_id == feature_id,
                    InvariantAcknowledgementModel.invariant_id.in_(
                        [item.id for item in invariants]
                    ),
                )
            ).all()
        }
        return [(item, acknowledgements.get(item.id)) for item in invariants]

    def acknowledge(
        self,
        workspace_id: str,
        project_id: str,
        feature_id: str,
        invariant_id: str,
        expected_revision: int,
    ) -> InvariantAcknowledgementModel:
        self._project(workspace_id, project_id, writable=True)
        self._feature(project_id, feature_id)
        invariant = self._invariant(project_id, invariant_id)
        if invariant.status != InvariantStatus.ACTIVE.value:
            raise InvalidInput("Retired invariants cannot be acknowledged")
        if invariant.feature_id is not None and invariant.feature_id != feature_id:
            raise EntityNotFound("Invariant does not apply to this feature")
        guard = self.session.execute(
            update(InvariantModel)
            .where(
                InvariantModel.id == invariant_id,
                InvariantModel.project_id == project_id,
                InvariantModel.status == InvariantStatus.ACTIVE.value,
                InvariantModel.revision == expected_revision,
            )
            .values(revision=InvariantModel.revision)
        )
        if getattr(guard, "rowcount", None) != 1:
            self.session.rollback()
            raise RevisionConflict(
                "Invariant changed before acknowledgement; reload the current revision"
            )
        acknowledgement = self.session.scalar(
            select(InvariantAcknowledgementModel).where(
                InvariantAcknowledgementModel.feature_id == feature_id,
                InvariantAcknowledgementModel.invariant_id == invariant_id,
            )
        )
        if acknowledgement is None:
            acknowledgement = InvariantAcknowledgementModel(
                feature_id=feature_id,
                invariant_id=invariant_id,
                acknowledged_revision=expected_revision,
            )
            self.session.add(acknowledgement)
        else:
            acknowledgement.acknowledged_revision = expected_revision
            acknowledgement.acknowledged_at = now()
        try:
            self.session.commit()
        except IntegrityError as exc:
            self.session.rollback()
            raise DuplicateName("This invariant acknowledgement already exists") from exc
        self.session.refresh(acknowledgement)
        return acknowledgement

    @staticmethod
    def _required_text(value: str, field: str) -> str:
        clean = clean_text(value)
        if clean is None:
            raise InvalidInput(f"{field} is required")
        return clean
