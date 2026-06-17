"""add payslip_settings to companies

Revision ID: l1g2h3i4j5k6
Revises: k0f1g2h3i4j5
Create Date: 2026-06-17 16:00:00.000000

Adds a single JSONB `payslip_settings` column to `companies` so each company can
customise its payslip template (branding + section toggles) from Settings →
Payslip. Nullable; missing keys fall back to built-in defaults at render time.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "l1g2h3i4j5k6"
down_revision: Union[str, None] = "k0f1g2h3i4j5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "companies",
        sa.Column("payslip_settings", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("companies", "payslip_settings")
