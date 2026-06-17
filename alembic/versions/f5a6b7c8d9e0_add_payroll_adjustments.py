"""add payroll_adjustments (per-run one-time earnings/deductions)

Revision ID: f5a6b7c8d9e0
Revises: e4f5a6b7c8d9
Create Date: 2026-06-17 11:30:00.000000

Per-run adjustments let HR attach one-time earnings (bonus, arrears, ad-hoc pay)
or deductions to a specific cycle + employee, without putting them on the
recurring salary structure. They are picked up on the next cycle run and applied
on top of the structure result (see services/payroll_service.compute_payslip).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "f5a6b7c8d9e0"
down_revision: Union[str, None] = "e4f5a6b7c8d9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_UUID = postgresql.UUID(as_uuid=True)
_UUID_DEFAULT = sa.text("uuid_generate_v4()")


def upgrade() -> None:
    op.create_table(
        "payroll_adjustments",
        sa.Column("id", _UUID, primary_key=True, server_default=_UUID_DEFAULT),
        sa.Column(
            "company_id",
            _UUID,
            sa.ForeignKey("companies.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "cycle_id",
            _UUID,
            sa.ForeignKey("payroll_cycles.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "employee_id",
            _UUID,
            sa.ForeignKey("employees.id"),
            nullable=False,
            index=True,
        ),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("code", sa.String(64), nullable=False),
        sa.Column("label", sa.String(120), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
    )
    op.create_index(
        "idx_adjustment_cycle_employee",
        "payroll_adjustments",
        ["cycle_id", "employee_id"],
    )


def downgrade() -> None:
    op.drop_index("idx_adjustment_cycle_employee", table_name="payroll_adjustments")
    op.drop_table("payroll_adjustments")
