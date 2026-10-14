"""add reported agent runs and handoff records

Revision ID: 20261014_0006
Revises: 20261014_0005
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261014_0006"
down_revision: str | None = "20261014_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _timestamps() -> tuple[sa.Column[object], sa.Column[object]]:
    return (
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )


def upgrade() -> None:
    op.create_table(
        "agent_runs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("feature_id", sa.String(length=36), nullable=False),
        sa.Column("context_package_id", sa.String(length=36), nullable=False),
        sa.Column("context_schema_version", sa.String(length=40), nullable=False),
        sa.Column("context_fingerprint", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("execution_mode", sa.String(length=20), nullable=False, server_default="manual"),
        sa.Column("executor_type", sa.String(length=40), nullable=False, server_default="human"),
        sa.Column("executor_label", sa.String(length=160), nullable=True),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="PLANNED"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        *_timestamps(),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["feature_id"], ["features.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["context_package_id"], ["context_packages.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_agent_runs_project_updated", "agent_runs", ["project_id", "updated_at"])
    op.create_index("ix_agent_runs_feature_status", "agent_runs", ["feature_id", "status"])
    op.create_index("ix_agent_runs_context_package", "agent_runs", ["context_package_id"])

    op.create_table(
        "run_events",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("run_id", sa.String(length=36), nullable=False),
        sa.Column("event_type", sa.String(length=32), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("origin", sa.String(length=20), nullable=False, server_default="manual"),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("supersedes_event_id", sa.String(length=36), nullable=True),
        sa.Column("payload_json", sa.Text(), nullable=False, server_default="{}"),
        sa.ForeignKeyConstraint(["run_id"], ["agent_runs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["supersedes_event_id"], ["run_events.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_run_events_run_recorded", "run_events", ["run_id", "recorded_at"])
    op.create_index("ix_run_events_supersedes", "run_events", ["supersedes_event_id"])

    op.create_table(
        "run_output_references",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("run_id", sa.String(length=36), nullable=False),
        sa.Column("label", sa.String(length=160), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("reference_kind", sa.String(length=32), nullable=False),
        sa.Column("reference_value", sa.String(length=500), nullable=True),
        sa.Column("provenance", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["run_id"], ["agent_runs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_run_outputs_run_created", "run_output_references", ["run_id", "created_at"]
    )

    op.create_table(
        "handoffs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("feature_id", sa.String(length=36), nullable=False),
        sa.Column("run_id", sa.String(length=36), nullable=False),
        sa.Column("context_package_id", sa.String(length=36), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("outcomes", sa.Text(), nullable=False),
        sa.Column("blockers", sa.Text(), nullable=False),
        sa.Column("questions", sa.Text(), nullable=False),
        sa.Column("next_actions", sa.Text(), nullable=False),
        sa.Column("references", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="DRAFT"),
        sa.Column("current_revision", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        *_timestamps(),
        sa.Column("ready_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("withdrawn_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["feature_id"], ["features.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["run_id"], ["agent_runs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["context_package_id"], ["context_packages.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_handoffs_project_updated", "handoffs", ["project_id", "updated_at"])
    op.create_index("ix_handoffs_run_status", "handoffs", ["run_id", "status"])

    op.create_table(
        "handoff_revisions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("handoff_id", sa.String(length=36), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("outcomes", sa.Text(), nullable=False),
        sa.Column("blockers", sa.Text(), nullable=False),
        sa.Column("questions", sa.Text(), nullable=False),
        sa.Column("next_actions", sa.Text(), nullable=False),
        sa.Column("references", sa.Text(), nullable=False),
        sa.Column("schema_version", sa.String(length=40), nullable=False),
        sa.Column("context_package_id", sa.String(length=36), nullable=False),
        sa.Column("context_fingerprint", sa.String(length=64), nullable=False),
        sa.Column("fingerprint", sa.String(length=64), nullable=False),
        sa.Column("payload_json", sa.Text(), nullable=False),
        sa.Column("markdown", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["handoff_id"], ["handoffs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("handoff_id", "revision", name="uq_handoff_revisions_revision"),
    )

    op.create_table(
        "handoff_acknowledgements",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("handoff_id", sa.String(length=36), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("acknowledged_by", sa.String(length=120), nullable=True),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["handoff_id"], ["handoffs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "handoff_id", "revision", name="uq_handoff_acknowledgements_revision"
        ),
    )


def downgrade() -> None:
    op.drop_table("handoff_acknowledgements")
    op.drop_table("handoff_revisions")
    op.drop_index("ix_handoffs_run_status", table_name="handoffs")
    op.drop_index("ix_handoffs_project_updated", table_name="handoffs")
    op.drop_table("handoffs")
    op.drop_index("ix_run_outputs_run_created", table_name="run_output_references")
    op.drop_table("run_output_references")
    op.drop_index("ix_run_events_supersedes", table_name="run_events")
    op.drop_index("ix_run_events_run_recorded", table_name="run_events")
    op.drop_table("run_events")
    op.drop_index("ix_agent_runs_context_package", table_name="agent_runs")
    op.drop_index("ix_agent_runs_feature_status", table_name="agent_runs")
    op.drop_index("ix_agent_runs_project_updated", table_name="agent_runs")
    op.drop_table("agent_runs")
