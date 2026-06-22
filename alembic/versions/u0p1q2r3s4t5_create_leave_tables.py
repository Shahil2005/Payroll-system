"""create leave_types + leave_balances + leave_requests

Revision ID: u0p1q2r3s4t5
Revises: t9o0p1q2r3s4
Create Date: 2026-06-18 16:30:00.000000

Leave management: company-defined leave types (paid/unpaid, with an annual quota
and accrual method), per-employee balances per financial year, and the leave
request lifecycle. APPROVED requests decrement balances and stamp timesheet days.
New tables — existing data unaffected.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "u0p1q2r3s4t5"
down_revision: Union[str, None] = "t9o0p1q2r3s4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "leave_types",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True),
            server_default=sa.text("uuid_generate_v4()"), nullable=False,
        ),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("code", sa.String(length=16), nullable=False),
        sa.Column("is_paid", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("annual_quota", sa.Numeric(6, 2), server_default=sa.text("0"), nullable=False),
        sa.Column("accrual", sa.String(length=16), server_default="ANNUAL", nullable=False),
        sa.Column("carry_forward_cap", sa.Numeric(6, 2), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("company_id", "code", name="uq_leave_type_company_code"),
    )
    op.create_index("ix_leave_types_company_id", "leave_types", ["company_id"])

    op.create_table(
        "leave_balances",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True),
            server_default=sa.text("uuid_generate_v4()"), nullable=False,
        ),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("employee_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("leave_type_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("financial_year", sa.String(length=7), server_default="2026-27", nullable=False),
        sa.Column("entitled", sa.Numeric(6, 2), server_default=sa.text("0"), nullable=False),
        sa.Column("accrued", sa.Numeric(6, 2), server_default=sa.text("0"), nullable=False),
        sa.Column("used", sa.Numeric(6, 2), server_default=sa.text("0"), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["leave_type_id"], ["leave_types.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "employee_id", "leave_type_id", "financial_year",
            name="uq_leave_balance_emp_type_fy",
        ),
    )
    op.create_index("ix_leave_balances_company_id", "leave_balances", ["company_id"])
    op.create_index("ix_leave_balances_employee_id", "leave_balances", ["employee_id"])
    op.create_index("ix_leave_balances_leave_type_id", "leave_balances", ["leave_type_id"])

    op.create_table(
        "leave_requests",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True),
            server_default=sa.text("uuid_generate_v4()"), nullable=False,
        ),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("employee_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("leave_type_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("days", sa.Numeric(6, 2), nullable=False),
        sa.Column("half_day", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("status", sa.String(length=16), server_default="PENDING", nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("decision_note", sa.Text(), nullable=True),
        sa.Column("requested_by_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("approved_by_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("decided_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["leave_type_id"], ["leave_types.id"]),
        sa.ForeignKeyConstraint(["requested_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["approved_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_leave_requests_company_id", "leave_requests", ["company_id"])
    op.create_index("ix_leave_requests_employee_id", "leave_requests", ["employee_id"])
    op.create_index("ix_leave_requests_leave_type_id", "leave_requests", ["leave_type_id"])


def downgrade() -> None:
    op.drop_index("ix_leave_requests_leave_type_id", table_name="leave_requests")
    op.drop_index("ix_leave_requests_employee_id", table_name="leave_requests")
    op.drop_index("ix_leave_requests_company_id", table_name="leave_requests")
    op.drop_table("leave_requests")
    op.drop_index("ix_leave_balances_leave_type_id", table_name="leave_balances")
    op.drop_index("ix_leave_balances_employee_id", table_name="leave_balances")
    op.drop_index("ix_leave_balances_company_id", table_name="leave_balances")
    op.drop_table("leave_balances")
    op.drop_index("ix_leave_types_company_id", table_name="leave_types")
    op.drop_table("leave_types")
