"""Optional local repository application use cases."""

import os
from pathlib import Path
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.application.common.errors import EntityNotFound, InvalidInput, RevisionConflict
from app.application.common.validation import now
from app.application.planning import PlanningService
from app.config import get_settings
from app.git.observer import GitObservation, GitObserver
from app.persistence.models import (
    FeatureModel,
    FeatureRepositoryLinkModel,
    GitObservationModel,
    RepositoryConnectionModel,
)


class RepositoryService:
    def __init__(self, session: Session, observer: GitObserver | None = None) -> None:
        self.session = session
        self.observer = observer or GitObserver()
        self.projects = PlanningService(session)

    def list_connections(
        self, workspace_id: str, project_id: str
    ) -> list[RepositoryConnectionModel]:
        self.projects.project(workspace_id, project_id)
        return list(
            self.session.scalars(
                select(RepositoryConnectionModel)
                .where(RepositoryConnectionModel.project_id == project_id)
                .order_by(RepositoryConnectionModel.created_at, RepositoryConnectionModel.id)
            ).all()
        )

    def get_connection(
        self, workspace_id: str, project_id: str, repository_id: str
    ) -> RepositoryConnectionModel:
        self.projects.project(workspace_id, project_id)
        repository = self.session.scalar(
            select(RepositoryConnectionModel).where(
                RepositoryConnectionModel.id == repository_id,
                RepositoryConnectionModel.project_id == project_id,
            )
        )
        if repository is None:
            raise EntityNotFound("Repository connection not found")
        return repository

    def connect(
        self, workspace_id: str, project_id: str, root_path: str
    ) -> RepositoryConnectionModel:
        self.projects.writable_project(workspace_id, project_id)
        # Enforce allowed roots configured in settings before observing the path.
        # This mitigates uncontrolled-path CodeQL findings by resolving the
        # user-supplied path and ensuring it is contained beneath one of the
        # pre-resolved, trusted roots returned by get_settings().resolved_allowed_repository_roots.
        resolved = self._normalized_path(
            root_path, get_settings().resolved_allowed_repository_roots
        )
        observation = self.observer.observe(resolved)
        if observation.status != "ok":
            raise InvalidInput(self._connection_error(observation))
        existing = self.session.scalar(
            select(RepositoryConnectionModel).where(
                RepositoryConnectionModel.project_id == project_id,
                RepositoryConnectionModel.root_path == str(resolved),
            )
        )
        if existing is not None:
            if existing.status == "disconnected":
                existing.status = "connected"
                existing.disconnected_at = None
                existing.updated_at = now()
                self.session.commit()
                self.session.refresh(existing)
                return existing
            raise RevisionConflict("This repository is already connected to the project")
        repository = RepositoryConnectionModel(
            id=str(uuid4()),
            project_id=project_id,
            root_path=str(resolved),
            status="connected",
            connected_at=now(),
        )
        self.session.add(repository)
        try:
            self.session.commit()
        except IntegrityError as exc:
            self.session.rollback()
            raise RevisionConflict("This repository is already connected to the project") from exc
        self.session.refresh(repository)
        return repository

    def disconnect(
        self, workspace_id: str, project_id: str, repository_id: str
    ) -> RepositoryConnectionModel:
        project = self.projects.writable_project(workspace_id, project_id)
        repository = self.get_connection(workspace_id, project.id, repository_id)
        repository.status = "disconnected"
        repository.disconnected_at = now()
        repository.updated_at = now()
        self.session.commit()
        self.session.refresh(repository)
        return repository

    def observe(
        self, workspace_id: str, project_id: str, repository_id: str
    ) -> tuple[RepositoryConnectionModel, GitObservationModel]:
        project = self.projects.writable_project(workspace_id, project_id)
        repository = self.get_connection(workspace_id, project.id, repository_id)
        if repository.status != "connected":
            raise InvalidInput("Disconnected repositories must be connected before observation")
        observation = self.observer.observe(repository.root_path)
        stored = self._store_observation(repository, observation)
        return repository, stored

    def observations(
        self, workspace_id: str, project_id: str, repository_id: str
    ) -> list[GitObservationModel]:
        repository = self.get_connection(workspace_id, project_id, repository_id)
        return list(
            self.session.scalars(
                select(GitObservationModel)
                .where(GitObservationModel.repository_id == repository.id)
                .order_by(GitObservationModel.observed_at.desc(), GitObservationModel.id.desc())
            ).all()
        )

    def link_feature(
        self, workspace_id: str, project_id: str, feature_id: str, repository_id: str
    ) -> FeatureRepositoryLinkModel:
        self.projects.writable_project(workspace_id, project_id)
        feature = self._feature(project_id, feature_id)
        repository = self.get_connection(workspace_id, project_id, repository_id)
        if repository.status != "connected":
            raise InvalidInput("Only connected repositories can be linked")
        link = FeatureRepositoryLinkModel(
            id=str(uuid4()), feature_id=feature.id, repository_id=repository.id
        )
        self.session.add(link)
        try:
            self.session.commit()
        except IntegrityError as exc:
            self.session.rollback()
            raise RevisionConflict("This repository is already linked to the feature") from exc
        self.session.refresh(link)
        return link

    def unlink_feature(
        self, workspace_id: str, project_id: str, feature_id: str, repository_id: str
    ) -> None:
        self.projects.writable_project(workspace_id, project_id)
        self._feature(project_id, feature_id)
        link = self.session.scalar(
            select(FeatureRepositoryLinkModel).where(
                FeatureRepositoryLinkModel.feature_id == feature_id,
                FeatureRepositoryLinkModel.repository_id == repository_id,
            )
        )
        if link is None:
            raise EntityNotFound("Feature repository link not found")
        self.session.delete(link)
        self.session.commit()

    def feature_links(
        self, workspace_id: str, project_id: str, feature_id: str
    ) -> list[RepositoryConnectionModel]:
        self.projects.project(workspace_id, project_id)
        self._feature(project_id, feature_id)
        return list(
            self.session.scalars(
                select(RepositoryConnectionModel)
                .join(
                    FeatureRepositoryLinkModel,
                    FeatureRepositoryLinkModel.repository_id == RepositoryConnectionModel.id,
                )
                .where(
                    FeatureRepositoryLinkModel.feature_id == feature_id,
                    RepositoryConnectionModel.project_id == project_id,
                )
                .order_by(RepositoryConnectionModel.root_path)
            ).all()
        )

    def _store_observation(
        self, repository: RepositoryConnectionModel, observation: GitObservation
    ) -> GitObservationModel:
        stored = GitObservationModel(
            id=str(uuid4()),
            repository_id=repository.id,
            observed_at=now(),
            head_sha=observation.head_sha,
            branch=observation.branch,
            detached=observation.detached,
            unborn=observation.unborn,
            clean=observation.clean,
            tracked_modified_count=observation.tracked_modified_count,
            staged_count=observation.staged_count,
            untracked_count=observation.untracked_count,
            observer_version=observation.observer_version,
            status=observation.status,
            error_code=observation.error_code,
            error_detail=observation.error_detail,
        )
        repository.last_observed_at = stored.observed_at
        repository.updated_at = now()
        self.session.add(stored)
        self.session.commit()
        self.session.refresh(stored)
        return stored

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
    def _normalized_path(root_path: str, allowed_roots: tuple[Path, ...]) -> Path:
        """Normalize and validate a user-supplied repository path.

        Security notes:
        - The function requires an absolute path and strictly resolves symlinks (Path.resolve(strict=True)).
        - It checks the resolved path against the configured allowed_roots using
          a separator-delimited prefix check so that traversal or symlink escape is
          rejected (prevents paths like "../outside" or symlinks that resolve outside
          the trusted roots).
        - allowed_roots MUST be a pre-resolved, trusted collection (see app.config).
        """
        value = root_path.strip()
        if not value:
            raise InvalidInput("Repository path is required")
        supplied_path = Path(value).expanduser()
        if not supplied_path.is_absolute():
            raise InvalidInput("Repository path must be absolute")
        try:
            path = supplied_path.resolve(strict=True)
        except (OSError, RuntimeError, ValueError) as exc:
            raise InvalidInput("Repository path does not exist") from exc

        # Resolve both sides before checking the separator-delimited prefix so
        # traversal and symlinks cannot escape a locally approved root.
        normalized_path = os.path.normcase(str(path))
        for allowed_root in allowed_roots:
            normalized_root = os.path.normcase(str(allowed_root.resolve(strict=True)))
            root_prefix = normalized_root.rstrip(os.sep) + os.sep
            if normalized_path == normalized_root or normalized_path.startswith(root_prefix):
                return path
        raise InvalidInput("Repository path must be within an approved local root")

    @staticmethod
    def _connection_error(observation: GitObservation) -> str:
        return (
            observation.error_detail
            or f"Repository cannot be observed ({observation.error_code or 'unknown error'})"
        )
