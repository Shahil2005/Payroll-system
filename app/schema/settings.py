import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class OrganizationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    currency: str
    legal_name: str | None = None
    industry: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    state: str | None = None
    pincode: str | None = None
    country: str = "India"
    pan: str | None = None
    tan: str | None = None
    created_at: datetime
    updated_at: datetime


class OrganizationUpdate(BaseModel):
    """All fields optional — partial update (only provided fields change)."""

    name: str | None = Field(default=None, min_length=1, max_length=160)
    currency: str | None = Field(default=None, min_length=1, max_length=8)
    legal_name: str | None = Field(default=None, max_length=200)
    industry: str | None = Field(default=None, max_length=120)
    contact_email: str | None = Field(default=None, max_length=255)
    contact_phone: str | None = Field(default=None, max_length=32)
    address_line1: str | None = Field(default=None, max_length=200)
    address_line2: str | None = Field(default=None, max_length=200)
    city: str | None = Field(default=None, max_length=120)
    state: str | None = Field(default=None, max_length=120)
    pincode: str | None = Field(default=None, max_length=16)
    country: str | None = Field(default=None, max_length=80)
    pan: str | None = Field(default=None, max_length=10)
    tan: str | None = Field(default=None, max_length=10)
