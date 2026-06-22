"""add submitted_by_id / approved_by_id to timesheets (maker-checker)

Revision ID: t9o0p1q2r3s4
Revises: s8n9o0p1q2r3
Create Date: 2026-06-18 16:00:00.000000

Segregation of duties: record which user submitted and which approved a
timesheet so the approve guard can reject same-actor approval when a company
turns on `enforce_maker_checker`. Nullable FKs to users (ON DELETE SET NULL) —
existing rows are unaffected.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "t9o0p1q2r3s4"
down_revision: Union[str, None] = "s8n9o0p1q2r3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "timesheets",
        sa.Column("submitted_by_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "timesheets",
        sa.Column("approved_by_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_timesheet_submitted_by",
        "timesheets",
        "users",
        ["submitted_by_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_timesheet_approved_by",
        "timesheets",
        "users",
        ["approved_by_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_timesheet_approved_by", "timesheets", type_="foreignkey")
    op.drop_constraint("fk_timesheet_submitted_by", "timesheets", type_="foreignkey")
    op.drop_column("timesheets", "approved_by_id")
    op.drop_column("timesheets", "submitted_by_id")
