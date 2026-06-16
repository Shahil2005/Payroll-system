"""add lop_days to salary_structures

Revision ID: d3e4f5a6b7c8
Revises: c2d3e4f5a6b7
Create Date: 2026-06-16 15:00:00.000000

HR enters the loss-of-pay (in days) per employee directly on the salary
structure; payroll runs read it to pro-rate earnings. Defaults to 0 so existing
structures are unaffected.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d3e4f5a6b7c8"
down_revision: Union[str, None] = "c2d3e4f5a6b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "salary_structures",
        sa.Column(
            "lop_days",
            sa.Numeric(5, 2),
            nullable=False,
            server_default="0",
        ),
    )


def downgrade() -> None:
    op.drop_column("salary_structures", "lop_days")
