import uuid
from datetime import datetime

from sqlalchemy import String, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base


class TimestampMixin:
    """Audit columns shared by every table (spec §2)."""

    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now()
    )
    deleted_at: Mapped[datetime | None] = mapped_column(default=None, nullable=True)


class Company(Base, TimestampMixin):
    """Tenant. Every business row carries a company_id FK to this table."""

    __tablename__ = "companies"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("uuid_generate_v4()"),
    )
    name: Mapped[str] = mapped_column(String(160))
    currency: Mapped[str] = mapped_column(String(8), default="INR")
