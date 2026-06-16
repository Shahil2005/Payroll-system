"""add users table for auth/RBAC + seed default users

Revision ID: c2d3e4f5a6b7
Revises: b1f2c3d4e5a6
Create Date: 2026-06-16 14:00:00.000000

Implements spec §7 (auth + RBAC). Adds a `users` table (distinct from
`employees`): users sign in and are authorized by `role`. Seeds three demo
users in the default company so the login screen works out of the box.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from app.core.security import hash_password

revision: str = "c2d3e4f5a6b7"
down_revision: Union[str, None] = "b1f2c3d4e5a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

DEFAULT_COMPANY_ID = "00000000-0000-0000-0000-000000000001"

_UUID = postgresql.UUID(as_uuid=True)
_UUID_DEFAULT = sa.text("uuid_generate_v4()")

# (email, password, full_name, role)
_SEED_USERS = [
    ("admin@croar.com", "admin123", "Admin User", "ADMIN"),
    ("hr@croar.com", "hr123", "HR Manager", "HR"),
    ("viewer@croar.com", "viewer123", "Read Only", "VIEWER"),
]


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", _UUID, primary_key=True, server_default=_UUID_DEFAULT),
        sa.Column(
            "company_id",
            _UUID,
            sa.ForeignKey("companies.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("email", sa.String(255), nullable=False, index=True),
        sa.Column("full_name", sa.String(160), nullable=False, server_default=""),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("role", sa.String(32), nullable=False, server_default="VIEWER"),
        sa.Column(
            "is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")
        ),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("company_id", "email", name="uq_user_company_email"),
    )

    users = sa.table(
        "users",
        sa.column("company_id", _UUID),
        sa.column("email", sa.String),
        sa.column("full_name", sa.String),
        sa.column("hashed_password", sa.String),
        sa.column("role", sa.String),
    )
    op.bulk_insert(
        users,
        [
            {
                "company_id": DEFAULT_COMPANY_ID,
                "email": email,
                "full_name": full_name,
                "hashed_password": hash_password(password),
                "role": role,
            }
            for email, password, full_name, role in _SEED_USERS
        ],
    )


def downgrade() -> None:
    op.drop_table("users")
