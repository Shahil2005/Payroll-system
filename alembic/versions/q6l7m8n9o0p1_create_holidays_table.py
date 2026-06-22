"""create holidays table

Revision ID: q6l7m8n9o0p1
Revises: p5k6l7m8n9o0
Create Date: 2026-06-18 14:00:00.000000

Company holidays. Together with the per-company weekly-offs (stored in
companies.statutory_settings) these are excluded when deriving the working-day
count for a payroll period (calendar_service.working_days_in_period). Existing
companies are unaffected until they add holidays / enable calendar working days.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "q6l7m8n9o0p1"
down_revision: Union[str, None] = "p5k6l7m8n9o0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "holidays",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("uuid_generate_v4()"),
            nullable=False,
        ),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("holiday_date", sa.Date(), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("company_id", "holiday_date", name="uq_holiday_company_date"),
    )
    op.create_index("ix_holidays_company_id", "holidays", ["company_id"])
    op.create_index("ix_holidays_holiday_date", "holidays", ["holiday_date"])


def downgrade() -> None:
    op.drop_index("ix_holidays_holiday_date", table_name="holidays")
    op.drop_index("ix_holidays_company_id", table_name="holidays")
    op.drop_table("holidays")
