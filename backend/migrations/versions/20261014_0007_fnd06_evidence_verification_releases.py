"""FND-06 evidence, deterministic verification and release candidates."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261014_0007"
down_revision: str | None = "20261014_0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "evidence_records",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(36),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("feature_id", sa.String(36), sa.ForeignKey("features.id", ondelete="RESTRICT")),
        sa.Column(
            "acceptance_criterion_id",
            sa.String(36),
            sa.ForeignKey("acceptance_criteria.id", ondelete="RESTRICT"),
        ),
        sa.Column("run_id", sa.String(36), sa.ForeignKey("agent_runs.id", ondelete="RESTRICT")),
        sa.Column(
            "handoff_revision_id",
            sa.String(36),
            sa.ForeignKey("handoff_revisions.id", ondelete="RESTRICT"),
        ),
        sa.Column(
            "context_package_id",
            sa.String(36),
            sa.ForeignKey("context_packages.id", ondelete="RESTRICT"),
        ),
        sa.Column(
            "git_observation_id",
            sa.String(36),
            sa.ForeignKey("git_observations.id", ondelete="RESTRICT"),
        ),
        sa.Column("evidence_type", sa.String(40), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("source_kind", sa.String(40), nullable=False),
        sa.Column("source_reference", sa.String(1000)),
        sa.Column("provenance", sa.String(20), nullable=False, server_default="REPORTED"),
        sa.Column("declared_outcome", sa.Text()),
        sa.Column("status", sa.String(20), nullable=False, server_default="ACTIVE"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("invalidated_at", sa.DateTime(timezone=True)),
    )
    op.create_index(
        "ix_evidence_project_recorded", "evidence_records", ["project_id", "recorded_at"]
    )
    op.create_index("ix_evidence_feature_status", "evidence_records", ["feature_id", "status"])
    op.create_index("ix_evidence_criterion", "evidence_records", ["acceptance_criterion_id"])

    op.create_table(
        "verification_evaluations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(36),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("feature_id", sa.String(36), sa.ForeignKey("features.id", ondelete="RESTRICT")),
        sa.Column("rule_id", sa.String(40), nullable=False),
        sa.Column("rule_version", sa.String(40), nullable=False),
        sa.Column("subject_json", sa.Text(), nullable=False),
        sa.Column("input_json", sa.Text(), nullable=False),
        sa.Column("input_fingerprint", sa.String(64), nullable=False),
        sa.Column("result", sa.String(24), nullable=False),
        sa.Column("findings_json", sa.Text(), nullable=False),
        sa.Column("limitations_json", sa.Text(), nullable=False),
        sa.Column("evidence_ids_json", sa.Text(), nullable=False),
        sa.Column("verifier_version", sa.String(40), nullable=False),
        sa.Column("evaluated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_verifications_project_date", "verification_evaluations", ["project_id", "evaluated_at"]
    )
    op.create_index(
        "ix_verifications_feature_rule", "verification_evaluations", ["feature_id", "rule_id"]
    )

    op.create_table(
        "release_candidates",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(36),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("candidate_key", sa.String(40), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("intended_version", sa.String(80)),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("status", sa.String(20), nullable=False, server_default="DRAFT"),
        sa.Column("schema_version", sa.String(40), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("content_fingerprint", sa.String(64), nullable=False),
        sa.Column("selection_json", sa.Text(), nullable=False),
        sa.Column("snapshot_json", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("frozen_at", sa.DateTime(timezone=True)),
    )
    op.create_index(
        "uq_release_candidates_project_key",
        "release_candidates",
        ["project_id", "candidate_key"],
        unique=True,
    )
    op.create_index(
        "ix_release_candidates_project_date", "release_candidates", ["project_id", "created_at"]
    )

    op.create_table(
        "release_candidate_revisions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "candidate_id",
            sa.String(36),
            sa.ForeignKey("release_candidates.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("content_fingerprint", sa.String(64), nullable=False),
        sa.Column("snapshot_json", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "uq_release_candidate_revision",
        "release_candidate_revisions",
        ["candidate_id", "revision"],
        unique=True,
    )

    op.create_table(
        "release_gate_evaluations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(36),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "candidate_id",
            sa.String(36),
            sa.ForeignKey("release_candidates.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("candidate_revision", sa.Integer(), nullable=False),
        sa.Column("ruleset_version", sa.String(40), nullable=False),
        sa.Column("input_fingerprint", sa.String(64), nullable=False),
        sa.Column("result", sa.String(32), nullable=False),
        sa.Column("findings_json", sa.Text(), nullable=False),
        sa.Column("limitations_json", sa.Text(), nullable=False),
        sa.Column("manifest_json", sa.Text(), nullable=False),
        sa.Column("manifest_fingerprint", sa.String(64), nullable=False),
        sa.Column("evaluated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_release_gates_candidate_date",
        "release_gate_evaluations",
        ["candidate_id", "evaluated_at"],
    )

    op.create_table(
        "release_manifests",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(36),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "candidate_id",
            sa.String(36),
            sa.ForeignKey("release_candidates.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "gate_evaluation_id",
            sa.String(36),
            sa.ForeignKey("release_gate_evaluations.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("schema_version", sa.String(40), nullable=False),
        sa.Column("fingerprint", sa.String(64), nullable=False),
        sa.Column("payload_json", sa.Text(), nullable=False),
        sa.Column("markdown", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "uq_release_manifest_candidate_gate",
        "release_manifests",
        ["candidate_id", "gate_evaluation_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_table("release_manifests")
    op.drop_index("ix_release_gates_candidate_date", table_name="release_gate_evaluations")
    op.drop_table("release_gate_evaluations")
    op.drop_table("release_candidate_revisions")
    op.drop_index("ix_release_candidates_project_date", table_name="release_candidates")
    op.drop_table("release_candidates")
    op.drop_index("ix_verifications_feature_rule", table_name="verification_evaluations")
    op.drop_index("ix_verifications_project_date", table_name="verification_evaluations")
    op.drop_table("verification_evaluations")
    op.drop_index("ix_evidence_criterion", table_name="evidence_records")
    op.drop_index("ix_evidence_feature_status", table_name="evidence_records")
    op.drop_index("ix_evidence_project_recorded", table_name="evidence_records")
    op.drop_table("evidence_records")
