import uuid
from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class EmployeeBase(BaseModel):
    first_name: str = Field(..., min_length=1, max_length=80)
    last_name: str = Field(default="", max_length=80)
    email: EmailStr
    employee_id: str | None = Field(default=None, max_length=64)
    payment_information: dict[str, Any] | None = None
    # ----- Statutory identifiers / drivers (Phase 1) -----
    pan: str | None = Field(default=None, max_length=10)
    uan: str | None = Field(default=None, max_length=20)
    esic_number: str | None = Field(default=None, max_length=20)
    state: str | None = Field(default=None, max_length=2, description="2-letter state code (drives PT)")
    date_of_joining: date | None = None


class EmployeeCreate(EmployeeBase):
    pass


class EmployeeUpdate(BaseModel):
    first_name: str | None = Field(default=None, min_length=1, max_length=80)
    last_name: str | None = Field(default=None, max_length=80)
    email: EmailStr | None = None
    employee_id: str | None = Field(default=None, max_length=64)
    payment_information: dict[str, Any] | None = None
    pan: str | None = Field(default=None, max_length=10)
    uan: str | None = Field(default=None, max_length=20)
    esic_number: str | None = Field(default=None, max_length=20)
    state: str | None = Field(default=None, max_length=2)
    date_of_joining: date | None = None


class EmployeeOut(EmployeeBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None = None
