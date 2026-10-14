"""create FND-02 planning entities

Revision ID: 20261013_0003
Revises: 20261013_0002
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261013_0003"
down_revision: str | None = "20261013_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _timestamps() -> tuple[sa.Column[object], sa.Column[object]]:
    return (
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )


def upgrade() -> None:
    op.create_table(
        "epics",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="planning"),
        *_timestamps(),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_epics_project_updated", "epics", ["project_id", "updated_at"])

    op.create_table(
        "features",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("epic_id", sa.String(length=36), nullable=True),
        sa.Column("readable_id", sa.String(length=24), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("goal", sa.Text(), nullable=True),
        sa.Column("priority", sa.String(length=20), nullable=False, server_default="medium"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="backlog"),
        *_timestamps(),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["epic_id"], ["epics.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "uq_features_project_readable_id", "features", ["project_id", "readable_id"], unique=True
    )
    op.create_index("ix_features_project_status", "features", ["project_id", "status"])
    op.create_index("ix_features_project_epic", "features", ["project_id", "epic_id"])

    op.create_table(
        "tasks",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("feature_id", sa.String(length=36), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="todo"),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        *_timestamps(),
        sa.ForeignKeyConstraint(["feature_id"], ["features.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_tasks_feature_position", "tasks", ["feature_id", "position"])

    op.create_table(
        "acceptance_criteria",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("feature_id", sa.String(length=36), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("satisfied", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        *_timestamps(),
        sa.ForeignKeyConstraint(["feature_id"], ["features.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_acceptance_criteria_feature_position",
        "acceptance_criteria",
        ["feature_id", "position"],
    )

    op.create_table(
        "feature_dependencies",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("blocking_feature_id", sa.String(length=36), nullable=False),
        sa.Column("blocked_feature_id", sa.String(length=36), nullable=False),
        *_timestamps(),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["blocking_feature_id"], ["features.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["blocked_feature_id"], ["features.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "uq_feature_dependencies_edge",
        "feature_dependencies",
        ["project_id", "blocking_feature_id", "blocked_feature_id"],
        unique=True,
    )
    op.create_index("ix_feature_dependencies_project", "feature_dependencies", ["project_id"])


def downgrade() -> None:
    op.drop_index("ix_feature_dependencies_project", table_name="feature_dependencies")
    op.drop_index("uq_feature_dependencies_edge", table_name="feature_dependencies")
    op.drop_table("feature_dependencies")
    op.drop_index("ix_acceptance_criteria_feature_position", table_name="acceptance_criteria")
    op.drop_table("acceptance_criteria")
    op.drop_index("ix_tasks_feature_position", table_name="tasks")
    op.drop_table("tasks")
    op.drop_index("ix_features_project_epic", table_name="features")
    op.drop_index("ix_features_project_status", table_name="features")
    op.drop_index("uq_features_project_readable_id", table_name="features")
    op.drop_table("features")
    op.drop_index("ix_epics_project_updated", table_name="epics")
    op.drop_table("epics")
