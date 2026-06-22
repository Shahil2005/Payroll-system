"""add hourly_rate to salary_structures

Revision ID: s8n9o0p1q2r3
Revises: r7m8n9o0p1q2
Create Date: 2026-06-18 15:00:00.000000

Hourly-paid staff: a structure with pay_frequency = HOURLY carries an
`hourly_rate` instead of a CTC; gross = hours_worked (from the approved
timesheet) * rate. Nullable, so existing (salaried) structures are unaffected.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "s8n9o0p1q2r3"
down_revision: Union[str, None] = "r7m8n9o0p1q2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "salary_structures",
        sa.Column("hourly_rate", sa.Numeric(12, 2), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("salary_structures", "hourly_rate")
