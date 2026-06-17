"""add employee_tax_profiles and tds_challans (Taxes & Forms)

Revision ID: i8d9e0f1g2h3
Revises: h7c8d9e0f1g2
Create Date: 2026-06-17 14:30:00.000000

Two engine-independent pieces of Zoho-style "Taxes & Forms":
- employee_tax_profiles: per-employee IT declaration (regime + declared
  investments/exemptions + previous-employer income). Captured now; consumed by
  a future TDS engine.
- tds_challans: recorded TDS payments to the government (manual record-keeping).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "i8d9e0f1g2h3"
down_revision: Union[str, None] = "h7c8d9e0f1g2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_UUID = postgresql.UUID(as_uuid=True)
_UUID_DEFAULT = sa.text("uuid_generate_v4()")
_MONEY = sa.Numeric(12, 2)
_FY = "2026-27"


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
    ]


def upgrade() -> None:
    op.create_table(
        "employee_tax_profiles",
        sa.Column("id", _UUID, primary_key=True, server_default=_UUID_DEFAULT),
        sa.Column("company_id", _UUID, sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("employee_id", _UUID, sa.ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("financial_year", sa.String(9), nullable=False, server_default=_FY),
        sa.Column("tax_regime", sa.String(8), nullable=False, server_default="NEW"),
        sa.Column("declared_80c", _MONEY, nullable=False, server_default=sa.text("0")),
        sa.Column("declared_80d", _MONEY, nullable=False, server_default=sa.text("0")),
        sa.Column("declared_hra_rent", _MONEY, nullable=False, server_default=sa.text("0")),
        sa.Column("declared_home_loan_interest", _MONEY, nullable=False, server_default=sa.text("0")),
        sa.Column("declared_other", _MONEY, nullable=False, server_default=sa.text("0")),
        sa.Column("prev_employer_income", _MONEY, nullable=False, server_default=sa.text("0")),
        sa.Column("prev_employer_tds", _MONEY, nullable=False, server_default=sa.text("0")),
        *_timestamps(),
        sa.UniqueConstraint("employee_id", name="uq_tax_profile_employee"),
    )
    op.create_table(
        "tds_challans",
        sa.Column("id", _UUID, primary_key=True, server_default=_UUID_DEFAULT),
        sa.Column("company_id", _UUID, sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("financial_year", sa.String(9), nullable=False, server_default=_FY),
        sa.Column("period_month", sa.String(7), nullable=False),
        sa.Column("amount", _MONEY, nullable=False),
        sa.Column("challan_number", sa.String(64), nullable=False),
        sa.Column("bsr_code", sa.String(16), nullable=True),
        sa.Column("deposit_date", sa.Date(), nullable=False),
        sa.Column("interest", _MONEY, nullable=False, server_default=sa.text("0")),
        sa.Column("penalty", _MONEY, nullable=False, server_default=sa.text("0")),
        sa.Column("notes", sa.Text(), nullable=True),
        *_timestamps(),
    )


def downgrade() -> None:
    op.drop_table("tds_challans")
    op.drop_table("employee_tax_profiles")
