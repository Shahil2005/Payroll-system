import uuid
from datetime import date
from typing import TYPE_CHECKING, Any

from sqlalchemy import Date, ForeignKey, String, UniqueConstraint, text
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

    # ----- Statutory identifiers / drivers (Phase 1) -----
    # PAN/UAN/ESIC feed compliance filings; `state` drives Professional Tax;
    # `date_of_joining` feeds eligibility/gratuity. All optional so existing
    # employees are unaffected until HR fills them in.
    pan: Mapped[str | None] = mapped_column(String(10), nullable=True)
    uan: Mapped[str | None] = mapped_column(String(20), nullable=True)
    esic_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    state: Mapped[str | None] = mapped_column(String(2), nullable=True)
    date_of_joining: Mapped[date | None] = mapped_column(Date, nullable=True)

    salary_structures: Mapped[list["SalaryStructure"]] = relationship(
        back_populates="employee", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint("company_id", "email", name="uq_employee_company_email"),
    )
