import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.constants import LineType, PayFrequency, PayrollCycleStatus, PayslipStatus


# ---------------------------------------------------------------------------
# Money line (shared union for earnings & deductions)
# ---------------------------------------------------------------------------
class MoneyLine(BaseModel):
    """A single earning or deduction line.

    type="fixed"   -> requires `amount` (monthly absolute value)
    type="percent" -> requires `percent`; `percent_of` references another line's
                      code, or is omitted to mean "of gross".
    """

    code: str = Field(..., min_length=1, max_length=64)
    label: str = Field(..., min_length=1, max_length=120)
    type: LineType
    amount: Decimal | None = None
    percent: Decimal | None = None
    percent_of: str | None = None

    @model_validator(mode="after")
    def _check_shape(self) -> "MoneyLine":
        if self.type == LineType.FIXED and self.amount is None:
            raise ValueError("fixed line requires 'amount'")
        if self.type == LineType.PERCENT and self.percent is None:
            raise ValueError("percent line requires 'percent'")
        return self


class ResolvedLine(BaseModel):
    code: str
    label: str
    amount: Decimal


# ---------------------------------------------------------------------------
# Salary structures
# ---------------------------------------------------------------------------
class SalaryStructureBase(BaseModel):
    ctc: Decimal = Field(..., description="Annual cost-to-company")
    currency: str = Field(default="INR", max_length=8)
    pay_frequency: PayFrequency = Field(default=PayFrequency.MONTHLY)
    effective_from: date
    components: list[MoneyLine]
    default_deductions: list[MoneyLine] = Field(default_factory=list)
    is_active: bool = Field(default=True)


class SalaryStructureCreate(SalaryStructureBase):
    employee_id: uuid.UUID


class SalaryStructureUpdate(BaseModel):
    ctc: Decimal | None = None
    currency: str | None = Field(default=None, max_length=8)
    pay_frequency: PayFrequency | None = None
    effective_from: date | None = None
    components: list[MoneyLine] | None = None
    default_deductions: list[MoneyLine] | None = None
    is_active: bool | None = None


class SalaryStructureOut(SalaryStructureBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    employee_id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None = None


# ---------------------------------------------------------------------------
# Payroll cycles
# ---------------------------------------------------------------------------
class PayrollCycleBase(BaseModel):
    name: str = Field(..., max_length=120)
    period_start: date
    period_end: date
    pay_date: date
    notes: str | None = None


class PayrollCycleCreate(PayrollCycleBase):
    @model_validator(mode="after")
    def _check_dates(self) -> "PayrollCycleCreate":
        if self.period_end < self.period_start:
            raise ValueError("period_end must be on or after period_start")
        if self.pay_date < self.period_start:
            raise ValueError("pay_date must be on or after period_start")
        return self


class CycleTotals(BaseModel):
    headcount: int = 0
    gross: Decimal = Decimal("0.00")
    deductions: Decimal = Decimal("0.00")
    net: Decimal = Decimal("0.00")


class PayrollCycleOut(PayrollCycleBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    status: PayrollCycleStatus
    totals: dict | None = None
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None = None


# ---------------------------------------------------------------------------
# Payslips
# ---------------------------------------------------------------------------
class PayslipOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    cycle_id: uuid.UUID
    employee_id: uuid.UUID
    gross_earnings: Decimal
    total_deductions: Decimal
    net_pay: Decimal
    lop_days: Decimal
    paid_days: Decimal | None = None
    currency: str
    status: PayslipStatus
    paid_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class PayslipDetailOut(PayslipOut):
    earnings: list[ResolvedLine]
    deductions: list[ResolvedLine]


# ---------------------------------------------------------------------------
# Run result
# ---------------------------------------------------------------------------
class SkippedEmployee(BaseModel):
    employee_id: uuid.UUID
    reason: str


class RunResult(BaseModel):
    created: int
    updated: int
    skipped: list[SkippedEmployee]
