"""create FND-03 decisions, invariants and readiness snapshots

Revision ID: 20261013_0004
Revises: 20261013_0003
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261013_0004"
down_revision: str | None = "20261013_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _timestamps() -> tuple[sa.Column[object], sa.Column[object]]:
    return (
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )


def upgrade() -> None:
    op.create_table(
        "decisions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("context", sa.Text(), nullable=False),
        sa.Column("decision", sa.Text(), nullable=False),
        sa.Column("rationale", sa.Text(), nullable=False),
        sa.Column("alternatives_considered", sa.Text(), nullable=True),
        sa.Column("tradeoffs", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="proposed"),
        sa.Column("superseded_by_id", sa.String(length=36), nullable=True),
        sa.Column("revision", sa.Integer(), nullable=False, server_default="1"),
        *_timestamps(),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["superseded_by_id"], ["decisions.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_decisions_project_updated", "decisions", ["project_id", "updated_at"])
    op.create_index("ix_decisions_project_status", "decisions", ["project_id", "status"])

    op.create_table(
        "decision_revisions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("decision_id", sa.String(length=36), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("context", sa.Text(), nullable=False),
        sa.Column("decision", sa.Text(), nullable=False),
        sa.Column("rationale", sa.Text(), nullable=False),
        sa.Column("alternatives_considered", sa.Text(), nullable=True),
        sa.Column("tradeoffs", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("superseded_by_id", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["decision_id"], ["decisions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("decision_id", "revision", name="uq_decision_revisions_revision"),
    )

    op.create_table(
        "decision_feature_links",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("decision_id", sa.String(length=36), nullable=False),
        sa.Column("feature_id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["decision_id"], ["decisions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["feature_id"], ["features.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("decision_id", "feature_id", name="uq_decision_feature_link"),
    )
    op.create_index("ix_decision_feature_links_feature", "decision_feature_links", ["feature_id"])

    op.create_table(
        "invariants",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("feature_id", sa.String(length=36), nullable=True),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("statement", sa.Text(), nullable=False),
        sa.Column("rationale", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
        sa.Column("revision", sa.Integer(), nullable=False, server_default="1"),
        *_timestamps(),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["feature_id"], ["features.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_invariants_project_status", "invariants", ["project_id", "status"])
    op.create_index("ix_invariants_feature_status", "invariants", ["feature_id", "status"])

    op.create_table(
        "invariant_revisions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("invariant_id", sa.String(length=36), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("statement", sa.Text(), nullable=False),
        sa.Column("rationale", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("feature_id", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["invariant_id"], ["invariants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("invariant_id", "revision", name="uq_invariant_revisions_revision"),
    )

    op.create_table(
        "invariant_acknowledgements",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("feature_id", sa.String(length=36), nullable=False),
        sa.Column("invariant_id", sa.String(length=36), nullable=False),
        sa.Column("acknowledged_revision", sa.Integer(), nullable=False),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["feature_id"], ["features.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["invariant_id"], ["invariants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("feature_id", "invariant_id", name="uq_invariant_acknowledgement"),
    )
    op.create_index(
        "ix_invariant_acknowledgements_invariant",
        "invariant_acknowledgements",
        ["invariant_id"],
    )

    op.create_table(
        "readiness_evaluations",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("feature_id", sa.String(length=36), nullable=False),
        sa.Column("evaluated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("rule_set_version", sa.String(length=40), nullable=False),
        sa.Column("input_fingerprint", sa.String(length=64), nullable=False),
        sa.Column("outcome", sa.String(length=30), nullable=False),
        sa.Column("results_json", sa.Text(), nullable=False),
        sa.Column("input_snapshot_json", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(["feature_id"], ["features.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_readiness_evaluations_feature_date",
        "readiness_evaluations",
        ["feature_id", "evaluated_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_readiness_evaluations_feature_date", table_name="readiness_evaluations")
    op.drop_table("readiness_evaluations")
    op.drop_index(
        "ix_invariant_acknowledgements_invariant", table_name="invariant_acknowledgements"
    )
    op.drop_table("invariant_acknowledgements")
    op.drop_table("invariant_revisions")
    op.drop_index("ix_invariants_feature_status", table_name="invariants")
    op.drop_index("ix_invariants_project_status", table_name="invariants")
    op.drop_table("invariants")
    op.drop_index("ix_decision_feature_links_feature", table_name="decision_feature_links")
    op.drop_table("decision_feature_links")
    op.drop_table("decision_revisions")
    op.drop_index("ix_decisions_project_status", table_name="decisions")
    op.drop_index("ix_decisions_project_updated", table_name="decisions")
    op.drop_table("decisions")
