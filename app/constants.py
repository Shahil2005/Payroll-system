import uuid
from enum import Enum

# ----- Default App Setup -----
LOG_PATH = "data/logs"

# ----- Multi-tenancy -----
# Auth/RBAC is deferred (see spec §7). Until JWT + get_current_user is wired,
# every request is scoped to this single seeded default company so the module
# behaves multi-tenant by construction (every row carries company_id).
DEFAULT_COMPANY_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")

# ----- Payroll calculation -----
# Spec §5: working_days default = a fixed 30 (calendar/business-day basis is a
# later, configurable decision). Monthly component amounts are defined against
# this basis; LOP days pro-rate against it.
DEFAULT_WORKING_DAYS = 30


# ----- Status values (stored as String, validated via these enums) -----
class PayrollCycleStatus(str, Enum):
    DRAFT = "DRAFT"
    PROCESSING = "PROCESSING"
    APPROVED = "APPROVED"
    PAID = "PAID"
    CANCELLED = "CANCELLED"


class PayslipStatus(str, Enum):
    PENDING = "PENDING"
    PAID = "PAID"


# ----- Money-line component types (earnings & deductions share this union) -----
class LineType(str, Enum):
    FIXED = "fixed"
    PERCENT = "percent"


class PayFrequency(str, Enum):
    MONTHLY = "MONTHLY"
    WEEKLY = "WEEKLY"


class TaxRegime(str, Enum):
    """India income-tax regime for TDS. NEW is the statutory default since
    FY 2023-24. Stored on the employee tax profile; consumed by a future TDS
    engine (not yet built — see statutory.py)."""

    OLD = "OLD"
    NEW = "NEW"


# Current financial year (Apr–Mar) used as the default for tax profiles and TDS
# challans. A literal (not computed) since Date.now() is unavailable in some
# contexts; bump when the FY rolls over.
DEFAULT_FINANCIAL_YEAR = "2026-27"


class AdjustmentKind(str, Enum):
    """A per-cycle, one-time pay line (not stored on the salary structure).

    EARNING adds to gross (bonus, arrears, ad-hoc pay); DEDUCTION subtracts
    (recovery, one-off deduction). Flat amounts: not LOP-prorated and outside
    the statutory wage base — see compute_payslip.
    """

    EARNING = "earning"
    DEDUCTION = "deduction"


# ----- Auth / RBAC (spec §7) -----------------------------------------------
# Permissions are fine-grained `payroll:*` capabilities. Routes require a
# specific permission; roles are bundles of permissions. The frontend hides
# nav/actions for capabilities the current user lacks, and the API returns 403.
class Permission(str, Enum):
    PAYROLL_READ = "payroll:read"          # view cycles, structures, payslips, employees
    PAYROLL_CONFIGURE = "payroll:configure"  # create/edit salary structures, employees, cycles
    PAYROLL_RUN = "payroll:run"            # run/recalculate a cycle
    PAYROLL_APPROVE = "payroll:approve"    # approve a processed cycle
    PAYROLL_PAY = "payroll:pay"            # mark a cycle paid
    PAYROLL_MANAGE = "payroll:manage"      # cancel/delete cycles
    USERS_MANAGE = "users:manage"          # create/list users (admin)


class Role(str, Enum):
    ADMIN = "ADMIN"      # full access incl. user management
    HR = "HR"            # full payroll lifecycle, no user management
    VIEWER = "VIEWER"    # read-only


# Role -> set of permissions it grants.
ROLE_PERMISSIONS: dict[Role, frozenset[Permission]] = {
    Role.ADMIN: frozenset(Permission),
    Role.HR: frozenset(
        {
            Permission.PAYROLL_READ,
            Permission.PAYROLL_CONFIGURE,
            Permission.PAYROLL_RUN,
            Permission.PAYROLL_APPROVE,
            Permission.PAYROLL_PAY,
            Permission.PAYROLL_MANAGE,
        }
    ),
    Role.VIEWER: frozenset({Permission.PAYROLL_READ}),
}


def permissions_for(role: str) -> frozenset[Permission]:
    """Resolve a (string) role to its permission set; unknown roles get none."""
    try:
        return ROLE_PERMISSIONS[Role(role)]
    except (ValueError, KeyError):
        return frozenset()
