"""add HR detail fields to employees

Revision ID: o4j5k6l7m8n9
Revises: n3i4j5k6l7m8
Create Date: 2026-06-17 20:30:00.000000

Adds optional HR/payslip fields (designation, department, location, bank
account no) to `employees` so they can appear on payslip templates. All
nullable; existing rows unaffected.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "o4j5k6l7m8n9"
down_revision: Union[str, None] = "n3i4j5k6l7m8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_COLUMNS = [
    ("designation", sa.String(120)),
    ("department", sa.String(120)),
    ("location", sa.String(120)),
    ("bank_account_no", sa.String(34)),
]


def upgrade() -> None:
    for name, col_type in _COLUMNS:
        op.add_column("employees", sa.Column(name, col_type, nullable=True))


def downgrade() -> None:
    for name, _ in reversed(_COLUMNS):
        op.drop_column("employees", name)
