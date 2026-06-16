import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    Date,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.constants import PayrollCycleStatus, PayslipStatus
from app.models import Base
from app.models.company import TimestampMixin
from app.models.employee import Employee


class SalaryStructure(Base, TimestampMixin):
    """One active salary package per employee (spec §4.1)."""

    __tablename__ = "salary_structures"

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
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employees.id"), index=True
    )
    ctc: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    currency: Mapped[str] = mapped_column(String(8), default="INR")
    pay_frequency: Mapped[str] = mapped_column(String(16), default="MONTHLY")
    effective_from: Mapped[date] = mapped_column(Date)
    # Earning lines: [{code,label,type,amount|percent,percent_of}]
    components: Mapped[list[dict[str, Any]]] = mapped_column(JSONB)
    # Recurring deduction lines applied each run (same union as components)
    default_deductions: Mapped[list[dict[str, Any]]] = mapped_column(JSONB)
    is_active: Mapped[bool] = mapped_column(default=True)

    employee: Mapped["Employee"] = relationship(back_populates="salary_structures")

    __table_args__ = (
        # Only one active, non-deleted structure per employee.
        Index(
            "idx_active_salary_structure",
            "employee_id",
            unique=True,
            postgresql_where=text("is_active AND deleted_at IS NULL"),
        ),
    )


class PayrollCycle(Base, TimestampMixin):
    """A pay period (spec §4.2)."""

    __tablename__ = "payroll_cycles"

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
    name: Mapped[str] = mapped_column(String(120))
    period_start: Mapped[date] = mapped_column(Date)
    period_end: Mapped[date] = mapped_column(Date)
    pay_date: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(
        String(16),
        default=PayrollCycleStatus.DRAFT.value,
        server_default=PayrollCycleStatus.DRAFT.value,
    )
    # Roll-up: { headcount, gross, deductions, net }
    totals: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    payslips: Mapped[list["Payslip"]] = relationship(
        back_populates="cycle", cascade="all, delete-orphan"
    )


class Payslip(Base, TimestampMixin):
    """One row per employee per cycle (spec §4.3). Earnings/deductions are
    snapshotted at run time, so later structure edits never mutate history."""

    __tablename__ = "payslips"

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
    cycle_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("payroll_cycles.id", ondelete="CASCADE"),
        index=True,
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employees.id"), index=True
    )
    gross_earnings: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    total_deductions: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    net_pay: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    lop_days: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("0.0"))
    paid_days: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    # Resolved line items [{code,label,amount}] (snapshot)
    earnings: Mapped[list[dict[str, Any]]] = mapped_column(JSONB)
    deductions: Mapped[list[dict[str, Any]]] = mapped_column(JSONB)
    currency: Mapped[str] = mapped_column(String(8), default="INR")
    status: Mapped[str] = mapped_column(
        String(16),
        default=PayslipStatus.PENDING.value,
        server_default=PayslipStatus.PENDING.value,
    )
    paid_at: Mapped[datetime | None] = mapped_column(nullable=True)

    cycle: Mapped[PayrollCycle] = relationship(back_populates="payslips")
    employee: Mapped["Employee"] = relationship()

    __table_args__ = (
        UniqueConstraint("cycle_id", "employee_id", name="uq_payslip_cycle_employee"),
    )
