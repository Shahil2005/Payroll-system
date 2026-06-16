import uuid
from typing import TYPE_CHECKING, Any

from sqlalchemy import ForeignKey, String, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models import Base
from app.models.company import TimestampMixin

if TYPE_CHECKING:
    from app.models.payroll import SalaryStructure


class Employee(Base, TimestampMixin):
    """An employee of a company — the source of "who to pay" for a payroll run.

    Mirrors the fields the spec (§3) expects to read from Croar's employees
    table. Active employees are those with deleted_at IS NULL.
    """

    __tablename__ = "employees"

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
    employee_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    first_name: Mapped[str] = mapped_column(String(80))
    last_name: Mapped[str] = mapped_column(String(80), default="")
    email: Mapped[str] = mapped_column(String(255))
    payment_information: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB, nullable=True, default=None
    )

    salary_structures: Mapped[list["SalaryStructure"]] = relationship(
        back_populates="employee", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint("company_id", "email", name="uq_employee_company_email"),
    )
