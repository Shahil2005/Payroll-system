from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import ForeignKey, Index, Numeric, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.constants import PayrollCycleStatus, PayslipStatus
from app.models import Base


class TimestampMixin:
    """Mixin to add creation and update timestamps to tables."""

    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now()
    )


class SalaryStructure(Base, TimestampMixin):
    """Model representing an employee's salary structure."""

    __tablename__ = "salary_structure"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True, index=True)
    company_id: Mapped[int] = mapped_column(index=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("user.id"), index=True)
    ctc: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    currency: Mapped[str] = mapped_column(default="INR")
    pay_frequency: Mapped[str] = mapped_column(default="MONTHLY")
    effective_from: Mapped[date] = mapped_column()
    components: Mapped[dict[str, Any]] = mapped_column(JSONB)
    default_deductions: Mapped[dict[str, Any]] = mapped_column(JSONB)
    is_active: Mapped[bool] = mapped_column(default=True)
    deleted_at: Mapped[datetime | None] = mapped_column(default=None)

    # Relationships
    employee: Mapped["User"] = relationship(back_populates="salary_structures")

    __table_args__ = (
        Index(
            "idx_active_salary_structure",
            "employee_id",
            unique=True,
            postgresql_where=text("is_active = true"),
        ),
    )


class PayrollCycle(Base, TimestampMixin):
    """Model representing a company's payroll run period."""

    __tablename__ = "payroll_cycle"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True, index=True)
    company_id: Mapped[int] = mapped_column(index=True)
    name: Mapped[str] = mapped_column()
    period_start: Mapped[date] = mapped_column()
    period_end: Mapped[date] = mapped_column()
    pay_date: Mapped[date] = mapped_column()
    status: Mapped[PayrollCycleStatus] = mapped_column(
        default=PayrollCycleStatus.DRAFT
    )
    totals: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    notes: Mapped[str | None] = mapped_column(nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(nullable=True)

    # Relationships
    payslips: Mapped[list["Payslip"]] = relationship(
        back_populates="cycle", cascade="all, delete-orphan"
    )


class Payslip(Base, TimestampMixin):
    """Model representing an individual employee payslip generated for a cycle."""

    __tablename__ = "payslip"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True, index=True)
    company_id: Mapped[int] = mapped_column(index=True)
    cycle_id: Mapped[int] = mapped_column(ForeignKey("payroll_cycle.id"), index=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("user.id"), index=True)
    gross_earnings: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    total_deductions: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    net_pay: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    lop_days: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("0.0"))
    paid_days: Mapped[Decimal] = mapped_column(Numeric(5, 2))
    earnings: Mapped[dict[str, Any]] = mapped_column(JSONB)
    deductions: Mapped[dict[str, Any]] = mapped_column(JSONB)
    currency: Mapped[str] = mapped_column(default="INR")
    status: Mapped[PayslipStatus] = mapped_column(default=PayslipStatus.PENDING)
    paid_at: Mapped[datetime | None] = mapped_column(nullable=True)

    # Relationships
    cycle: Mapped[PayrollCycle] = relationship(back_populates="payslips")
    employee: Mapped["User"] = relationship()

    __table_args__ = (
        UniqueConstraint("cycle_id", "employee_id", name="uq_payslip_cycle_employee"),
    )
