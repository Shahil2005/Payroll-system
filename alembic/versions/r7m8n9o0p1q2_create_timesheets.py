"""create timesheets + timesheet_entries

Revision ID: r7m8n9o0p1q2
Revises: q6l7m8n9o0p1
Create Date: 2026-06-18 14:30:00.000000

Attendance timesheets: one `timesheets` row per employee per payroll cycle (with
cached aggregates), plus one `timesheet_entries` row per day. APPROVED timesheets
feed a payroll run (LOP days for salaried, total hours for hourly). New tables —
existing data unaffected.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "r7m8n9o0p1q2"
down_revision: Union[str, None] = "q6l7m8n9o0p1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "timesheets",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("uuid_generate_v4()"),
            nullable=False,
        ),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("cycle_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("employee_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column("mode", sa.String(length=16), server_default="ATTENDANCE", nullable=False),
        sa.Column("status", sa.String(length=16), server_default="DRAFT", nullable=False),
        sa.Column("worked_days", sa.Numeric(6, 2), server_default=sa.text("0"), nullable=False),
        sa.Column("lop_days", sa.Numeric(6, 2), server_default=sa.text("0"), nullable=False),
        sa.Column("half_days", sa.Numeric(6, 2), server_default=sa.text("0"), nullable=False),
        sa.Column("total_hours", sa.Numeric(8, 2), server_default=sa.text("0"), nullable=False),
        sa.Column("submitted_at", sa.DateTime(), nullable=True),
        sa.Column("approved_at", sa.DateTime(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["cycle_id"], ["payroll_cycles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("cycle_id", "employee_id", name="uq_timesheet_cycle_employee"),
    )
    op.create_index("ix_timesheets_company_id", "timesheets", ["company_id"])
    op.create_index("ix_timesheets_cycle_id", "timesheets", ["cycle_id"])
    op.create_index("ix_timesheets_employee_id", "timesheets", ["employee_id"])

    op.create_table(
        "timesheet_entries",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("uuid_generate_v4()"),
            nullable=False,
        ),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("timesheet_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("entry_date", sa.Date(), nullable=False),
        sa.Column("day_status", sa.String(length=16), nullable=False),
        sa.Column("hours", sa.Numeric(5, 2), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["timesheet_id"], ["timesheets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("timesheet_id", "entry_date", name="uq_entry_timesheet_date"),
    )
    op.create_index("ix_timesheet_entries_company_id", "timesheet_entries", ["company_id"])
    op.create_index("idx_entry_timesheet", "timesheet_entries", ["timesheet_id"])


def downgrade() -> None:
    op.drop_index("idx_entry_timesheet", table_name="timesheet_entries")
    op.drop_index("ix_timesheet_entries_company_id", table_name="timesheet_entries")
    op.drop_table("timesheet_entries")
    op.drop_index("ix_timesheets_employee_id", table_name="timesheets")
    op.drop_index("ix_timesheets_cycle_id", table_name="timesheets")
    op.drop_index("ix_timesheets_company_id", table_name="timesheets")
    op.drop_table("timesheets")
