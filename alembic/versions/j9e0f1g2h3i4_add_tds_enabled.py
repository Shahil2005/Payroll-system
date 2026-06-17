"""add tds_enabled toggle to salary_structures

Revision ID: j9e0f1g2h3i4
Revises: i8d9e0f1g2h3
Create Date: 2026-06-17 15:30:00.000000

Opt-in income-tax (TDS) computation per salary structure. Off by default so
existing structures compute exactly as before until HR enables it.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "j9e0f1g2h3i4"
down_revision: Union[str, None] = "i8d9e0f1g2h3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "salary_structures",
        sa.Column("tds_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )


def downgrade() -> None:
    op.drop_column("salary_structures", "tds_enabled")
