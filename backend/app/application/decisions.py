from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.application.services import (
    DuplicateName,
    EntityNotFound,
    InvalidInput,
    clean_text,
    clean_title,
    now,
)
from app.domain.entities import DecisionStatus
from app.persistence.models import (
    DecisionFeatureLinkModel,
    DecisionModel,
    DecisionRevisionModel,
    FeatureModel,
    ProjectModel,
)
from app.persistence.repositories import ProjectRepository


class DecisionService:
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

    def _decision(self, project_id: str, decision_id: str) -> DecisionModel:
        decision = self.session.scalar(
            select(DecisionModel).where(
                DecisionModel.id == decision_id, DecisionModel.project_id == project_id
            )
        )
        if decision is None:
            raise EntityNotFound("Decision not found")
        return decision

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
    def _snapshot(decision: DecisionModel) -> DecisionRevisionModel:
        return DecisionRevisionModel(
            decision_id=decision.id,
            revision=decision.revision,
            title=decision.title,
            context=decision.context,
            decision=decision.decision,
            rationale=decision.rationale,
            alternatives_considered=decision.alternatives_considered,
            tradeoffs=decision.tradeoffs,
            status=decision.status,
            superseded_by_id=decision.superseded_by_id,
        )

    def list_decisions(self, workspace_id: str, project_id: str) -> list[DecisionModel]:
        self._project(workspace_id, project_id)
        return list(
            self.session.scalars(
                select(DecisionModel)
                .where(DecisionModel.project_id == project_id)
                .order_by(DecisionModel.updated_at.desc(), DecisionModel.title)
            ).all()
        )

    def get(self, workspace_id: str, project_id: str, decision_id: str) -> DecisionModel:
        self._project(workspace_id, project_id)
        return self._decision(project_id, decision_id)

    def create(
        self,
        workspace_id: str,
        project_id: str,
        title: str,
        context: str,
        decision_text: str,
        rationale: str,
        alternatives_considered: str | None,
        tradeoffs: str | None,
    ) -> DecisionModel:
        self._project(workspace_id, project_id, writable=True)
        values = self._clean_fields(
            title, context, decision_text, rationale, alternatives_considered, tradeoffs
        )
        decision = DecisionModel(
            project_id=project_id, status=DecisionStatus.PROPOSED.value, **values
        )
        self.session.add(decision)
        self.session.flush()
        self.session.add(self._snapshot(decision))
        self.session.commit()
        self.session.refresh(decision)
        return decision

    def update(
        self,
        workspace_id: str,
        project_id: str,
        decision_id: str,
        title: str | None,
        context: str | None,
        decision_text: str | None,
        rationale: str | None,
        alternatives_considered: str | None,
        tradeoffs: str | None,
    ) -> DecisionModel:
        self._project(workspace_id, project_id, writable=True)
        decision = self._decision(project_id, decision_id)
        if decision.status == DecisionStatus.SUPERSEDED.value:
            raise InvalidInput("Superseded decisions cannot be edited")
        if title is not None:
            decision.title = clean_title(title)
        if context is not None:
            decision.context = self._required_text(context, "Context")
        if decision_text is not None:
            decision.decision = self._required_text(decision_text, "Decision")
        if rationale is not None:
            decision.rationale = self._required_text(rationale, "Rationale")
        if alternatives_considered is not None:
            decision.alternatives_considered = clean_text(alternatives_considered)
        if tradeoffs is not None:
            decision.tradeoffs = clean_text(tradeoffs)
        decision.revision += 1
        decision.updated_at = now()
        self.session.flush()
        self.session.add(self._snapshot(decision))
        self.session.commit()
        self.session.refresh(decision)
        return decision

    def accept(self, workspace_id: str, project_id: str, decision_id: str) -> DecisionModel:
        self._project(workspace_id, project_id, writable=True)
        decision = self._decision(project_id, decision_id)
        if decision.status == DecisionStatus.SUPERSEDED.value:
            raise InvalidInput("Superseded decisions cannot be accepted")
        if decision.status != DecisionStatus.ACCEPTED.value:
            decision.status = DecisionStatus.ACCEPTED.value
            decision.revision += 1
            decision.updated_at = now()
            self.session.flush()
            self.session.add(self._snapshot(decision))
            self.session.commit()
            self.session.refresh(decision)
        return decision

    def supersede(
        self,
        workspace_id: str,
        project_id: str,
        decision_id: str,
        title: str,
        context: str,
        decision_text: str,
        rationale: str,
        alternatives_considered: str | None,
        tradeoffs: str | None,
    ) -> tuple[DecisionModel, DecisionModel]:
        self._project(workspace_id, project_id, writable=True)
        previous = self._decision(project_id, decision_id)
        if previous.status == DecisionStatus.SUPERSEDED.value:
            raise InvalidInput("Decision is already superseded")
        values = self._clean_fields(
            title, context, decision_text, rationale, alternatives_considered, tradeoffs
        )
        successor = DecisionModel(
            project_id=project_id, status=DecisionStatus.PROPOSED.value, **values
        )
        self.session.add(successor)
        self.session.flush()
        previous.status = DecisionStatus.SUPERSEDED.value
        previous.superseded_by_id = successor.id
        previous.revision += 1
        previous.updated_at = now()
        self.session.add(self._snapshot(previous))
        self.session.add(self._snapshot(successor))
        try:
            self.session.commit()
        except IntegrityError as exc:
            self.session.rollback()
            raise InvalidInput("Could not supersede decision") from exc
        self.session.refresh(previous)
        self.session.refresh(successor)
        return previous, successor

    def revisions(
        self, workspace_id: str, project_id: str, decision_id: str
    ) -> list[DecisionRevisionModel]:
        self._project(workspace_id, project_id)
        decision = self._decision(project_id, decision_id)
        return list(
            self.session.scalars(
                select(DecisionRevisionModel)
                .where(DecisionRevisionModel.decision_id == decision.id)
                .order_by(DecisionRevisionModel.revision.desc())
            ).all()
        )

    def link(self, workspace_id: str, project_id: str, decision_id: str, feature_id: str) -> None:
        self._project(workspace_id, project_id, writable=True)
        decision = self._decision(project_id, decision_id)
        if decision.status == DecisionStatus.SUPERSEDED.value:
            raise InvalidInput("Superseded decisions cannot be linked")
        self._feature(project_id, feature_id)
        existing = self.session.scalar(
            select(DecisionFeatureLinkModel).where(
                DecisionFeatureLinkModel.decision_id == decision_id,
                DecisionFeatureLinkModel.feature_id == feature_id,
            )
        )
        if existing is not None:
            raise DuplicateName("This decision is already linked to the feature")
        self.session.add(DecisionFeatureLinkModel(decision_id=decision_id, feature_id=feature_id))
        try:
            self.session.commit()
        except IntegrityError as exc:
            self.session.rollback()
            raise DuplicateName("This decision is already linked to the feature") from exc

    def unlink(self, workspace_id: str, project_id: str, decision_id: str, feature_id: str) -> None:
        self._project(workspace_id, project_id, writable=True)
        self._decision(project_id, decision_id)
        self._feature(project_id, feature_id)
        link = self.session.scalar(
            select(DecisionFeatureLinkModel).where(
                DecisionFeatureLinkModel.decision_id == decision_id,
                DecisionFeatureLinkModel.feature_id == feature_id,
            )
        )
        if link is None:
            raise EntityNotFound("Decision link not found")
        self.session.delete(link)
        self.session.commit()

    def feature_decisions(
        self, workspace_id: str, project_id: str, feature_id: str
    ) -> list[DecisionModel]:
        self._project(workspace_id, project_id)
        self._feature(project_id, feature_id)
        return list(
            self.session.scalars(
                select(DecisionModel)
                .join(
                    DecisionFeatureLinkModel,
                    DecisionFeatureLinkModel.decision_id == DecisionModel.id,
                )
                .where(
                    DecisionFeatureLinkModel.feature_id == feature_id,
                    DecisionModel.project_id == project_id,
                )
                .order_by(DecisionModel.updated_at.desc())
            ).all()
        )

    @staticmethod
    def _required_text(value: str, field: str) -> str:
        clean = clean_text(value)
        if clean is None:
            raise InvalidInput(f"{field} is required")
        return clean

    @classmethod
    def _clean_fields(
        cls,
        title: str,
        context: str,
        decision_text: str,
        rationale: str,
        alternatives_considered: str | None,
        tradeoffs: str | None,
    ) -> dict[str, str | None]:
        return {
            "title": clean_title(title),
            "context": cls._required_text(context, "Context"),
            "decision": cls._required_text(decision_text, "Decision"),
            "rationale": cls._required_text(rationale, "Rationale"),
            "alternatives_considered": clean_text(alternatives_considered),
            "tradeoffs": clean_text(tradeoffs),
        }
