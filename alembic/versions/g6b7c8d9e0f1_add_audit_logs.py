"""add audit_logs (activity trail)

Revision ID: g6b7c8d9e0f1
Revises: f5a6b7c8d9e0
Create Date: 2026-06-17 12:30:00.000000

Append-only audit trail (who did what, when). One row per authenticated mutating
request, written by the audit middleware. Decoupled from other tables (no FKs)
so history survives deletes and is never mutated.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "g6b7c8d9e0f1"
down_revision: Union[str, None] = "f5a6b7c8d9e0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_UUID = postgresql.UUID(as_uuid=True)
_UUID_DEFAULT = sa.text("uuid_generate_v4()")


def upgrade() -> None:
    op.create_table(
        "audit_logs",
        sa.Column("id", _UUID, primary_key=True, server_default=_UUID_DEFAULT),
        sa.Column("company_id", _UUID, nullable=True, index=True),
        sa.Column("actor_id", _UUID, nullable=True),
        sa.Column("actor_email", sa.String(255), nullable=True),
        sa.Column("action", sa.String(160), nullable=False),
        sa.Column("method", sa.String(8), nullable=False),
        sa.Column("path", sa.String(255), nullable=False),
        sa.Column("status_code", sa.Integer(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(), server_default=sa.func.now(), index=True
        ),
    )


def downgrade() -> None:
    op.drop_table("audit_logs")
