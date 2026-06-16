from datetime import date, datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.constants import PayrollCycleStatus, PayslipStatus


# --- Salary Structure Schemas ---
class SalaryStructureBase(BaseModel):
    ctc: Decimal = Field(..., description="Annual Cost to Company")
    currency: str = Field(default="INR")
    pay_frequency: str = Field(default="MONTHLY")
    effective_from: date
    components: dict[str, Any] = Field(
        ...,
        description="Earnings components dictionary (e.g. {'basic': {'type': 'percentage', 'value': 50}})",
    )
    default_deductions: dict[str, Any] = Field(
        ...,
        description="Default deductions dictionary (e.g. {'pf': {'type': 'percentage', 'value': 12}})",
    )
    is_active: bool = Field(default=True)


class SalaryStructureCreate(SalaryStructureBase):
    employee_id: int


class SalaryStructureUpdate(BaseModel):
    ctc: Decimal | None = None
    currency: str | None = None
    pay_frequency: str | None = None
    effective_from: date | None = None
    components: dict[str, Any] | None = None
    default_deductions: dict[str, Any] | None = None
    is_active: bool | None = None


class SalaryStructureResponse(SalaryStructureBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    employee_id: int
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None = None


# --- Payroll Cycle Schemas ---
class PayrollCycleBase(BaseModel):
    name: str
    period_start: date
    period_end: date
    pay_date: date
    notes: str | None = None


class PayrollCycleCreate(PayrollCycleBase):
    pass


class PayrollCycleResponse(PayrollCycleBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    status: PayrollCycleStatus
    totals: dict[str, Any]
    paid_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


# --- Payslip Schemas ---
class PayslipResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    cycle_id: int
    employee_id: int
    gross_earnings: Decimal
    total_deductions: Decimal
    net_pay: Decimal
    lop_days: Decimal
    paid_days: Decimal
    currency: str
    status: PayslipStatus
    paid_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class PayslipDetailResponse(PayslipResponse):
    model_config = ConfigDict(from_attributes=True)

    earnings: dict[str, Any]
    deductions: dict[str, Any]
