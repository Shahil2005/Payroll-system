"""add payslip_doc_template to companies

Revision ID: n3i4j5k6l7m8
Revises: m2h3i4j5k6l7
Create Date: 2026-06-17 19:30:00.000000

Adds storage for an optional uploaded .docx payslip template (docxtpl) plus its
original filename, so a company can have payslips generated from their own Word
document. Both nullable; when unset the built-in layout is used.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "n3i4j5k6l7m8"
down_revision: Union[str, None] = "m2h3i4j5k6l7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("companies", sa.Column("payslip_doc_template", sa.LargeBinary(), nullable=True))
    op.add_column("companies", sa.Column("payslip_doc_filename", sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column("companies", "payslip_doc_filename")
    op.drop_column("companies", "payslip_doc_template")
