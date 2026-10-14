"""add local Git observations and immutable context packages

Revision ID: 20261014_0005
Revises: 20261013_0004
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261014_0005"
down_revision: str | None = "20261013_0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _timestamps() -> tuple[sa.Column[object], sa.Column[object]]:
    return (
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )


def upgrade() -> None:
    op.create_table(
        "repository_connections",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("root_path", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="connected"),
        sa.Column("connected_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("disconnected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_observed_at", sa.DateTime(timezone=True), nullable=True),
        *_timestamps(),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "project_id", "root_path", name="uq_repository_connections_project_root"
        ),
    )
    op.create_index(
        "ix_repository_connections_project_status",
        "repository_connections",
        ["project_id", "status"],
    )

    op.create_table(
        "git_observations",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("repository_id", sa.String(length=36), nullable=False),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("head_sha", sa.String(length=64), nullable=True),
        sa.Column("branch", sa.String(length=255), nullable=True),
        sa.Column("detached", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("unborn", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("clean", sa.Boolean(), nullable=True),
        sa.Column("tracked_modified_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("staged_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("untracked_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("observer_version", sa.String(length=40), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("error_code", sa.String(length=40), nullable=True),
        sa.Column("error_detail", sa.String(length=240), nullable=True),
        sa.ForeignKeyConstraint(
            ["repository_id"], ["repository_connections.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_git_observations_repository_date", "git_observations", ["repository_id", "observed_at"]
    )

    op.create_table(
        "feature_repository_links",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("feature_id", sa.String(length=36), nullable=False),
        sa.Column("repository_id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["feature_id"], ["features.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["repository_id"], ["repository_connections.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("feature_id", "repository_id", name="uq_feature_repository_link"),
    )
    op.create_index(
        "ix_feature_repository_links_repository", "feature_repository_links", ["repository_id"]
    )

    op.create_table(
        "context_packages",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("feature_id", sa.String(length=36), nullable=False),
        sa.Column("schema_version", sa.String(length=40), nullable=False),
        sa.Column("fingerprint", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("payload_json", sa.Text(), nullable=False),
        sa.Column("markdown", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["feature_id"], ["features.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "feature_id",
            "schema_version",
            "fingerprint",
            name="uq_context_packages_feature_schema_fingerprint",
        ),
    )
    op.create_index(
        "ix_context_packages_project_feature_date",
        "context_packages",
        ["project_id", "feature_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_context_packages_project_feature_date", table_name="context_packages")
    op.drop_table("context_packages")
    op.drop_index("ix_feature_repository_links_repository", table_name="feature_repository_links")
    op.drop_table("feature_repository_links")
    op.drop_index("ix_git_observations_repository_date", table_name="git_observations")
    op.drop_table("git_observations")
    op.drop_index("ix_repository_connections_project_status", table_name="repository_connections")
    op.drop_table("repository_connections")
