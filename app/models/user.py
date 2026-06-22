import uuid

from sqlalchemy import Boolean, ForeignKey, String, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.constants import Role
from app.models import Base
from app.models.company import TimestampMixin


class User(Base, TimestampMixin):
    """An application user who signs in to operate payroll (spec §7).

    Distinct from Employee: a User authenticates and is authorized via `role`,
    whereas an Employee is a subject who gets paid. A User belongs to a company
    (multi-tenant scoping) and carries a role that maps to a permission set.

    `employee_id` optionally links a self-service (EMPLOYEE-role) user to the
    Employee record they own, so self-scoped endpoints (/api/v1/me/*) can return
    only that person's data. Null for admin/HR/viewer users (who aren't a single
    employee). ON DELETE SET NULL — removing an employee never deletes the login.
    """

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("uuid_generate_v4()"),
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        index=True,
    )
    email: Mapped[str] = mapped_column(String(255), index=True)
    full_name: Mapped[str] = mapped_column(String(160), default="")
    hashed_password: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(32), default=Role.VIEWER.value)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    employee_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    __table_args__ = (
        UniqueConstraint("company_id", "email", name="uq_user_company_email"),
    )
