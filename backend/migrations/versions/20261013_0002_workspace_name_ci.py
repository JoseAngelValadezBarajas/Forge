"""enforce case-insensitive workspace names

Revision ID: 20261013_0002
Revises: 20261013_0001
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261013_0002"
down_revision: str | None = "20261013_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_index("uq_workspaces_name", table_name="workspaces")
    op.create_index(
        "uq_workspaces_name_ci",
        "workspaces",
        [sa.text("lower(name)")],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_workspaces_name_ci", table_name="workspaces")
    op.create_index("uq_workspaces_name", "workspaces", ["name"], unique=True)
