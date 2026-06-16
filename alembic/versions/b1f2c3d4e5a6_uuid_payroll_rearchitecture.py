"""uuid payroll re-architecture (companies, employees, array components)

Revision ID: b1f2c3d4e5a6
Revises: 32299336a743
Create Date: 2026-06-16 12:00:00.000000

Replaces the integer/enum MVP schema with the spec-conformant model:
UUID PKs, companies + employees tables, String status columns (no native PG
enums), soft-delete on every table, and a seeded default company.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "b1f2c3d4e5a6"
down_revision: Union[str, None] = "32299336a743"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

DEFAULT_COMPANY_ID = "00000000-0000-0000-0000-000000000001"

_UUID = postgresql.UUID(as_uuid=True)
_UUID_DEFAULT = sa.text("uuid_generate_v4()")


def upgrade() -> None:
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')

    # --- Drop the old integer-keyed schema ---
    op.execute("DROP TABLE IF EXISTS payslip CASCADE")
    op.execute("DROP TABLE IF EXISTS salary_structure CASCADE")
    op.execute("DROP TABLE IF EXISTS payroll_cycle CASCADE")
    op.execute('DROP TABLE IF EXISTS "user" CASCADE')
    op.execute("DROP TYPE IF EXISTS payrollcyclestatus")
    op.execute("DROP TYPE IF EXISTS payslipstatus")

    # --- companies ---
    op.create_table(
        "companies",
        sa.Column("id", _UUID, server_default=_UUID_DEFAULT, nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("currency", sa.String(length=8), nullable=False, server_default="INR"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )

    # --- employees ---
    op.create_table(
        "employees",
        sa.Column("id", _UUID, server_default=_UUID_DEFAULT, nullable=False),
        sa.Column("company_id", _UUID, nullable=False),
        sa.Column("employee_id", sa.String(length=64), nullable=True),
        sa.Column("first_name", sa.String(length=80), nullable=False),
        sa.Column("last_name", sa.String(length=80), nullable=False, server_default=""),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("payment_information", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("company_id", "email", name="uq_employee_company_email"),
    )
    op.create_index(op.f("ix_employees_company_id"), "employees", ["company_id"])

    # --- salary_structures ---
    op.create_table(
        "salary_structures",
        sa.Column("id", _UUID, server_default=_UUID_DEFAULT, nullable=False),
        sa.Column("company_id", _UUID, nullable=False),
        sa.Column("employee_id", _UUID, nullable=False),
        sa.Column("ctc", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("currency", sa.String(length=8), nullable=False, server_default="INR"),
        sa.Column("pay_frequency", sa.String(length=16), nullable=False, server_default="MONTHLY"),
        sa.Column("effective_from", sa.Date(), nullable=False),
        sa.Column("components", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("default_deductions", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_salary_structures_company_id"), "salary_structures", ["company_id"])
    op.create_index(op.f("ix_salary_structures_employee_id"), "salary_structures", ["employee_id"])
    op.create_index(
        "idx_active_salary_structure",
        "salary_structures",
        ["employee_id"],
        unique=True,
        postgresql_where=sa.text("is_active AND deleted_at IS NULL"),
    )

    # --- payroll_cycles ---
    op.create_table(
        "payroll_cycles",
        sa.Column("id", _UUID, server_default=_UUID_DEFAULT, nullable=False),
        sa.Column("company_id", _UUID, nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column("pay_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="DRAFT"),
        sa.Column("totals", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_payroll_cycles_company_id"), "payroll_cycles", ["company_id"])

    # --- payslips ---
    op.create_table(
        "payslips",
        sa.Column("id", _UUID, server_default=_UUID_DEFAULT, nullable=False),
        sa.Column("company_id", _UUID, nullable=False),
        sa.Column("cycle_id", _UUID, nullable=False),
        sa.Column("employee_id", _UUID, nullable=False),
        sa.Column("gross_earnings", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("total_deductions", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("net_pay", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("lop_days", sa.Numeric(precision=5, scale=2), nullable=False),
        sa.Column("paid_days", sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column("earnings", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("deductions", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("currency", sa.String(length=8), nullable=False, server_default="INR"),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="PENDING"),
        sa.Column("paid_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["cycle_id"], ["payroll_cycles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("cycle_id", "employee_id", name="uq_payslip_cycle_employee"),
    )
    op.create_index(op.f("ix_payslips_company_id"), "payslips", ["company_id"])
    op.create_index(op.f("ix_payslips_cycle_id"), "payslips", ["cycle_id"])
    op.create_index(op.f("ix_payslips_employee_id"), "payslips", ["employee_id"])

    # --- Seed the default company used for scoping until auth lands ---
    op.execute(
        f"""
        INSERT INTO companies (id, name, currency, created_at, updated_at)
        VALUES ('{DEFAULT_COMPANY_ID}', 'Croar Technologies', 'INR', now(), now())
        ON CONFLICT (id) DO NOTHING
        """
    )


def downgrade() -> None:
    op.drop_table("payslips")
    op.drop_table("payroll_cycles")
    op.drop_table("salary_structures")
    op.drop_table("employees")
    op.drop_table("companies")
