"""add statutory_settings to companies

Revision ID: m2h3i4j5k6l7
Revises: l1g2h3i4j5k6
Create Date: 2026-06-17 18:00:00.000000

Adds a JSONB `statutory_settings` column to `companies` so an admin can override
the flat statutory rates/thresholds (PF/ESI/TDS scalars) from Settings →
Statutory Compliance. Nullable; missing keys fall back to the code constants.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "m2h3i4j5k6l7"
down_revision: Union[str, None] = "l1g2h3i4j5k6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "companies",
        sa.Column("statutory_settings", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("companies", "statutory_settings")
