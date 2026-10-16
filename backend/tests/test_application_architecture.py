"""Regression tests for canonical application boundaries and compatibility imports."""

from pathlib import Path

import pytest

from app.application.common import errors, validation
from app.application.context_packages import ContextPackageService
from app.application.git_context import (
    ContextPackageService as FacadeContextPackageService,
)
from app.application.git_context import (
    RepositoryService as FacadeRepositoryService,
)
from app.application.handoffs import HandoffService
from app.application.planning import PlanningService
from app.application.projects import ProjectService
from app.application.repositories import RepositoryService
from app.application.runs import HandoffService as FacadeHandoffService
from app.application.runs import RunService
from app.application.runs.service import RunService as CanonicalRunService
from app.application.services import (
    DuplicateName,
    EntityNotFound,
    InvalidInput,
    RevisionConflict,
    ServiceError,
    WorkspaceService,
    clean_name,
    now,
)
from app.application.services import (
    PlanningService as FacadePlanningService,
)
from app.application.services import (
    ProjectService as FacadeProjectService,
)
from app.application.services import ensure_local_workspace as facade_ensure_local_workspace
from app.application.workspaces import WorkspaceService as CanonicalWorkspaceService
from app.application.workspaces import ensure_local_workspace
from architecture.check_application_boundaries import check_architecture


def _write_app(root: Path, relative: str, content: str) -> None:
    path = root / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def test_actual_application_tree_obeys_boundaries() -> None:
    app_root = Path(__file__).resolve().parents[1] / "app"

    assert check_architecture(app_root) == []


def test_checker_accepts_independent_layered_imports(tmp_path: Path) -> None:
    app_root = tmp_path / "app"
    _write_app(app_root, "application/common/errors.py", "class InvalidInput(Exception): pass\n")
    _write_app(
        app_root,
        "application/use_case.py",
        "from app.application.common.errors import InvalidInput\n",
    )
    _write_app(app_root, "domain/entities.py", "class Entity: pass\n")
    _write_app(app_root, "persistence/repositories.py", "class Repository: pass\n")

    assert check_architecture(app_root) == []


def test_checker_rejects_domain_dependency_on_application(tmp_path: Path) -> None:
    app_root = tmp_path / "app"
    _write_app(
        app_root, "domain/entities.py", "from app.application.services import InvalidInput\n"
    )

    violations = check_architecture(app_root)

    assert len(violations) == 1
    assert "domain code cannot depend on app.application.services" in violations[0]


def test_checker_rejects_application_dependency_on_compatibility_facade(tmp_path: Path) -> None:
    app_root = tmp_path / "app"
    _write_app(
        app_root,
        "application/use_case.py",
        "from app.application.services import PlanningService\n",
    )

    violations = check_architecture(app_root)

    assert len(violations) == 1
    assert "import canonical ownership instead of compatibility facade" in violations[0]


@pytest.mark.parametrize(
    "facade",
    [
        "app.application.services",
        "app.application.runs",
        "app.application.git_context",
    ],
)
def test_checker_rejects_each_compatibility_facade_independently(
    tmp_path: Path, facade: str
) -> None:
    app_root = tmp_path / "app"
    _write_app(app_root, "application/use_case.py", f"import {facade}\n")

    violations = check_architecture(app_root)

    assert len(violations) == 1
    assert f"compatibility facade {facade}" in violations[0]


def test_checker_rejects_imported_compatibility_submodule_alias(tmp_path: Path) -> None:
    app_root = tmp_path / "app"
    _write_app(app_root, "application/services.py", "")
    _write_app(app_root, "application/use_case.py", "from app.application import services\n")

    violations = check_architecture(app_root)

    assert any("compatibility facade app.application.services" in item for item in violations)


def test_checker_rejects_application_dependency_on_api(tmp_path: Path) -> None:
    app_root = tmp_path / "app"
    _write_app(app_root, "application/use_case.py", "from app.api import router\n")

    violations = check_architecture(app_root)

    assert len(violations) == 1
    assert "application code cannot depend on app.api" in violations[0]


def test_checker_rejects_persistence_dependency_on_application(tmp_path: Path) -> None:
    app_root = tmp_path / "app"
    _write_app(
        app_root,
        "persistence/repositories.py",
        "from app.application.common.errors import EntityNotFound\n",
    )

    violations = check_architecture(app_root)

    assert len(violations) == 1
    assert "persistence code cannot depend on app.application.common.errors" in violations[0]


def test_checker_reports_isolated_application_cycle(tmp_path: Path) -> None:
    app_root = tmp_path / "app"
    _write_app(app_root, "application/alpha.py", "from app.application.beta import Beta\n")
    _write_app(app_root, "application/beta.py", "from app.application.alpha import Alpha\n")

    violations = check_architecture(app_root)

    assert len(violations) == 1
    assert "Application import cycle:" in violations[0]


def test_compatibility_facades_reexport_canonical_identities() -> None:
    assert ServiceError is errors.ServiceError
    assert EntityNotFound is errors.EntityNotFound
    assert DuplicateName is errors.DuplicateName
    assert InvalidInput is errors.InvalidInput
    assert RevisionConflict is errors.RevisionConflict
    assert clean_name is validation.clean_name
    assert now is validation.now
    assert WorkspaceService is CanonicalWorkspaceService
    assert facade_ensure_local_workspace is ensure_local_workspace
    assert FacadeProjectService is ProjectService
    assert FacadePlanningService is PlanningService
    assert RunService is CanonicalRunService
    assert FacadeHandoffService is HandoffService
    assert FacadeContextPackageService is ContextPackageService
    assert FacadeRepositoryService is RepositoryService
