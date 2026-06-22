"""link a user to an employee (self-service)

Revision ID: v1q2r3s4t5u6
Revises: u0p1q2r3s4t5
Create Date: 2026-06-22 12:00:00.000000

Adds users.employee_id so an EMPLOYEE-role login can be tied to the Employee
record it owns; self-scoped /api/v1/me endpoints filter by it. Nullable FK
(ON DELETE SET NULL) — existing admin/HR/viewer users are unaffected (NULL).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "v1q2r3s4t5u6"
down_revision: Union[str, None] = "u0p1q2r3s4t5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("employee_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index("ix_users_employee_id", "users", ["employee_id"])
    op.create_foreign_key(
        "fk_user_employee",
        "users",
        "employees",
        ["employee_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_user_employee", "users", type_="foreignkey")
    op.drop_index("ix_users_employee_id", table_name="users")
    op.drop_column("users", "employee_id")
