"""Indian statutory computation — Phase 1: EPF, ESI, Professional Tax.

Pure Decimal functions, no DB access. Rates/thresholds live here as dated
constants so they are easy to audit and update; the computed values *and* the
rate-set version are snapshotted onto each payslip at run time, so a re-rendered
historical payslip always reflects the rules that applied then.

IMPORTANT: the rates and PT slabs below are encoded to the best of current
knowledge (FY 2024-25) but MUST be verified against the latest EPFO/ESIC
notifications and each state's Professional Tax schedule before production use.
Statutory values change with the Union Budget and state notifications.

Scope notes:
- TDS / income tax is intentionally out of scope here (Phase 2 — it needs annual
  projection, regimes and declarations).
- Professional Tax is state-specific; a handful of major states are seeded.
  Unknown/unseeded states yield ₹0 PT and a note in the snapshot.
"""
from decimal import ROUND_CEILING, ROUND_HALF_UP, Decimal
from typing import Any

# Version stamp recorded on each payslip's statutory snapshot.
RULESET_VERSION = "IN-FY2024-25"

# ----- EPF (Employees' Provident Fund) -------------------------------------
PF_WAGE_CEILING = Decimal("15000")     # statutory monthly wage ceiling
PF_EMPLOYEE_RATE = Decimal("0.12")     # employee share of PF wages
PF_EMPLOYER_RATE = Decimal("0.12")     # total employer share of PF wages
EPS_RATE = Decimal("0.0833")           # employer pension share (of capped wage)
EPS_WAGE_CEILING = Decimal("15000")    # EPS is always computed on min(wage, this)

# ----- ESI (Employees' State Insurance) ------------------------------------
ESI_WAGE_LIMIT = Decimal("21000")      # covered only if monthly gross <= this
ESI_EMPLOYEE_RATE = Decimal("0.0075")  # 0.75%
ESI_EMPLOYER_RATE = Decimal("0.0325")  # 3.25%

# ----- Professional Tax (state monthly slabs) ------------------------------
# Each entry: ascending bands of (upper_inclusive_gross | None, monthly_amount).
# None upper bound = "and above". VERIFY against current state notifications.
PT_SLABS: dict[str, list[tuple[Decimal | None, Decimal]]] = {
    "KA": [(Decimal("24999"), Decimal("0")), (None, Decimal("200"))],
    "MH": [
        (Decimal("7500"), Decimal("0")),
        (Decimal("10000"), Decimal("175")),
        (None, Decimal("200")),  # ₹300 in February (special month not modelled)
    ],
    "WB": [
        (Decimal("10000"), Decimal("0")),
        (Decimal("15000"), Decimal("110")),
        (Decimal("25000"), Decimal("130")),
        (Decimal("40000"), Decimal("150")),
        (None, Decimal("200")),
    ],
    "TG": [
        (Decimal("15000"), Decimal("0")),
        (Decimal("20000"), Decimal("150")),
        (None, Decimal("200")),
    ],
    "AP": [
        (Decimal("15000"), Decimal("0")),
        (Decimal("20000"), Decimal("150")),
        (None, Decimal("200")),
    ],
}


def _round(amount: Decimal) -> Decimal:
    """Round to the nearest rupee, returned at 2dp (matches money columns)."""
    return amount.quantize(Decimal("1"), rounding=ROUND_HALF_UP).quantize(Decimal("0.01"))


def _round_up(amount: Decimal) -> Decimal:
    """Round up to the next rupee (ESI convention), returned at 2dp."""
    return amount.quantize(Decimal("1"), rounding=ROUND_CEILING).quantize(Decimal("0.01"))


def compute_pf(pf_wage: Decimal, *, cap_at_ceiling: bool = True) -> dict[str, Any]:
    """Employee + employer EPF on ``pf_wage`` (usually Basic, or Basic+DA).

    When ``cap_at_ceiling`` the contributory wage is min(pf_wage, ₹15,000).
    The employer 12% splits into EPS (8.33% of the EPS-capped wage) and EPF
    (the remainder).
    """
    contributory = min(pf_wage, PF_WAGE_CEILING) if cap_at_ceiling else pf_wage
    eps_wage = min(pf_wage, EPS_WAGE_CEILING)

    employee = _round(contributory * PF_EMPLOYEE_RATE)
    employer_total = _round(contributory * PF_EMPLOYER_RATE)
    employer_eps = _round(eps_wage * EPS_RATE)
    employer_epf = _round(employer_total - employer_eps)
    return {
        "employee": employee,
        "employer_total": employer_total,
        "employer_eps": employer_eps,
        "employer_epf": employer_epf,
        "wage_considered": _round(contributory),
    }


def compute_esi(gross: Decimal) -> dict[str, Any]:
    """Employee + employer ESI when ``gross`` is within the coverage limit."""
    if gross > ESI_WAGE_LIMIT:
        return {"covered": False, "employee": Decimal("0.00"), "employer": Decimal("0.00")}
    return {
        "covered": True,
        "employee": _round_up(gross * ESI_EMPLOYEE_RATE),
        "employer": _round_up(gross * ESI_EMPLOYER_RATE),
    }


def compute_pt(state: str | None, gross: Decimal) -> dict[str, Any]:
    """Professional Tax for ``state`` (2-letter code) at the given monthly gross."""
    code = (state or "").strip().upper()
    slabs = PT_SLABS.get(code)
    if not slabs:
        return {
            "amount": Decimal("0.00"),
            "state": code or None,
            "note": "no PT slab configured for this state",
        }
    for upper, amount in slabs:
        if upper is None or gross <= upper:
            return {"amount": _round(amount), "state": code, "note": None}
    return {"amount": Decimal("0.00"), "state": code, "note": None}


def supported_pt_states() -> list[str]:
    """State codes with a configured PT schedule."""
    return sorted(PT_SLABS.keys())
