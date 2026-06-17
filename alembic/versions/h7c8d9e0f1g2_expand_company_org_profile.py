"""expand companies with organisation-profile fields

Revision ID: h7c8d9e0f1g2
Revises: g6b7c8d9e0f1
Create Date: 2026-06-17 13:30:00.000000

Adds organisation-profile columns to `companies` so the Settings → Organisation
Profile screen can edit org data (legal name, industry, contact, address, and
org-level PAN/TAN). All nullable; defaults keep existing rows valid.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "h7c8d9e0f1g2"
down_revision: Union[str, None] = "g6b7c8d9e0f1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_COLUMNS = [
    ("legal_name", sa.String(200)),
    ("industry", sa.String(120)),
    ("contact_email", sa.String(255)),
    ("contact_phone", sa.String(32)),
    ("address_line1", sa.String(200)),
    ("address_line2", sa.String(200)),
    ("city", sa.String(120)),
    ("state", sa.String(120)),
    ("pincode", sa.String(16)),
    ("pan", sa.String(10)),
    ("tan", sa.String(10)),
]


def upgrade() -> None:
    for name, col_type in _COLUMNS:
        op.add_column("companies", sa.Column(name, col_type, nullable=True))
    op.add_column(
        "companies",
        sa.Column("country", sa.String(80), nullable=False, server_default="India"),
    )


def downgrade() -> None:
    op.drop_column("companies", "country")
    for name, _ in reversed(_COLUMNS):
        op.drop_column("companies", name)
