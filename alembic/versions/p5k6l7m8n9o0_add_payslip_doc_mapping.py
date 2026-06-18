"""add payslip doc original + mapping columns

Revision ID: p5k6l7m8n9o0
Revises: o4j5k6l7m8n9
Create Date: 2026-06-18 12:00:00.000000

Supports the payslip "smart mapping" wizard: keeps the admin's original
token-free .docx upload (`payslip_doc_original`) and the confirmed
{slot_index: token} mapping (`payslip_doc_mapping`) alongside the token-filled
template in `payslip_doc_template`. Both nullable; existing companies unaffected.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "p5k6l7m8n9o0"
down_revision: Union[str, None] = "o4j5k6l7m8n9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "companies",
        sa.Column("payslip_doc_original", sa.LargeBinary(), nullable=True),
    )
    op.add_column(
        "companies",
        sa.Column("payslip_doc_mapping", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("companies", "payslip_doc_mapping")
    op.drop_column("companies", "payslip_doc_original")
