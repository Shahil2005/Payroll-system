"""add salary_templates and structures.template_id

Revision ID: k0f1g2h3i4j5
Revises: j9e0f1g2h3i4
Create Date: 2026-06-17 16:00:00.000000

Reusable, CTC-driven salary templates (Zoho/RazorpayX "Salary Templates").
A template carries component *rules* (percent-of-CTC + a balance line) with no
employee or CTC; applying it generates a per-employee salary_structure scaled to
that employee's CTC. salary_structures gains a nullable template_id for
traceability (ON DELETE SET NULL — deleting a template never touches pay).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "k0f1g2h3i4j5"
down_revision: Union[str, None] = "j9e0f1g2h3i4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_UUID = postgresql.UUID(as_uuid=True)
_UUID_DEFAULT = sa.text("uuid_generate_v4()")
_JSONB = postgresql.JSONB(astext_type=sa.Text())


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
    ]


def upgrade() -> None:
    op.create_table(
        "salary_templates",
        sa.Column("id", _UUID, primary_key=True, server_default=_UUID_DEFAULT),
        sa.Column("company_id", _UUID, sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("currency", sa.String(8), nullable=False, server_default="INR"),
        sa.Column("pay_frequency", sa.String(16), nullable=False, server_default="MONTHLY"),
        sa.Column("components", _JSONB, nullable=False),
        sa.Column("default_deductions", _JSONB, nullable=False),
        sa.Column("pf_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("pf_cap_at_ceiling", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("pf_wage_codes", _JSONB, nullable=True),
        sa.Column("esi_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("pt_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("tds_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        *_timestamps(),
    )
    # Unique template name per company amongst non-deleted rows.
    op.create_index(
        "idx_unique_template_name",
        "salary_templates",
        ["company_id", "name"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )

    op.add_column(
        "salary_structures",
        sa.Column(
            "template_id",
            _UUID,
            sa.ForeignKey("salary_templates.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "idx_salary_structure_template", "salary_structures", ["template_id"]
    )


def downgrade() -> None:
    op.drop_index("idx_salary_structure_template", table_name="salary_structures")
    op.drop_column("salary_structures", "template_id")
    op.drop_index("idx_unique_template_name", table_name="salary_templates")
    op.drop_table("salary_templates")
