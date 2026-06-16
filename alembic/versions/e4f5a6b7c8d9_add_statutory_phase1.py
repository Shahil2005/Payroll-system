"""add statutory phase 1 (PF/ESI/PT) fields

Revision ID: e4f5a6b7c8d9
Revises: d3e4f5a6b7c8
Create Date: 2026-06-16 17:30:00.000000

Phase 1 statutory compliance (EPF, ESI, Professional Tax):
- employees: statutory identifiers (PAN/UAN/ESIC), state (drives PT), DOJ.
- salary_structures: opt-in toggles + PF wage basis. Defaults keep existing
  structures computing exactly as before until HR enables statutory.
- payslips: employer_contributions (CTC cost, not deducted) + statutory snapshot.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "e4f5a6b7c8d9"
down_revision: Union[str, None] = "d3e4f5a6b7c8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- employees: statutory identifiers + drivers ---
    op.add_column("employees", sa.Column("pan", sa.String(length=10), nullable=True))
    op.add_column("employees", sa.Column("uan", sa.String(length=20), nullable=True))
    op.add_column("employees", sa.Column("esic_number", sa.String(length=20), nullable=True))
    op.add_column("employees", sa.Column("state", sa.String(length=2), nullable=True))
    op.add_column("employees", sa.Column("date_of_joining", sa.Date(), nullable=True))

    # --- salary_structures: opt-in statutory toggles ---
    op.add_column(
        "salary_structures",
        sa.Column("pf_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "salary_structures",
        sa.Column(
            "pf_cap_at_ceiling", sa.Boolean(), nullable=False, server_default=sa.text("true")
        ),
    )
    op.add_column(
        "salary_structures",
        sa.Column("pf_wage_codes", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column(
        "salary_structures",
        sa.Column("esi_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "salary_structures",
        sa.Column("pt_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )

    # --- payslips: employer cost + statutory snapshot ---
    op.add_column(
        "payslips",
        sa.Column("employer_contributions", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column(
        "payslips",
        sa.Column("statutory", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("payslips", "statutory")
    op.drop_column("payslips", "employer_contributions")

    op.drop_column("salary_structures", "pt_enabled")
    op.drop_column("salary_structures", "esi_enabled")
    op.drop_column("salary_structures", "pf_wage_codes")
    op.drop_column("salary_structures", "pf_cap_at_ceiling")
    op.drop_column("salary_structures", "pf_enabled")

    op.drop_column("employees", "date_of_joining")
    op.drop_column("employees", "state")
    op.drop_column("employees", "esic_number")
    op.drop_column("employees", "uan")
    op.drop_column("employees", "pan")
