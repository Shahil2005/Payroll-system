import uuid
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import DEFAULT_WORKING_DAYS, LineType, PayrollCycleStatus, PayslipStatus
from app.models.employee import Employee
from app.models.payroll import PayrollCycle, Payslip, SalaryStructure


def _q(amount: Decimal) -> Decimal:
    """Round a money amount to 2 dp (ROUND_HALF_UP)."""
    return amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _resolve_amount(
    line: dict[str, Any],
    by_code: dict[str, Decimal],
    base_when_omitted: Decimal,
) -> Decimal:
    """Resolve a single money line to an absolute amount.

    - fixed:   the line's `amount` (monthly value).
    - percent: `percent`% of the `percent_of` line's resolved amount, or of
               `base_when_omitted` (gross-so-far for earnings, gross for
               deductions) when `percent_of` is omitted.
    """
    line_type = line.get("type")
    if line_type == LineType.FIXED.value:
        return Decimal(str(line.get("amount") or "0"))
    if line_type == LineType.PERCENT.value:
        pct = Decimal(str(line.get("percent") or "0"))
        percent_of = line.get("percent_of")
        base = by_code.get(percent_of, Decimal("0")) if percent_of else base_when_omitted
        return (pct / Decimal("100")) * base
    return Decimal("0")


def compute_payslip(
    structure: SalaryStructure,
    lop_days: Decimal,
    working_days: Decimal,
) -> dict[str, Any]:
    """Pure payslip calculation (spec §5).

    1. Resolve each earning line (fixed / percent-of-code / percent-of-gross).
    2. gross = sum(earnings); pro-rate by paid/working days when lop_days > 0.
    3. Resolve deductions the same way (percent_of a code, or percent of gross).
    4. net = gross - deductions.

    Each resolved line is rounded to 2 dp before summing (avoids cent drift).
    """
    if working_days <= 0:
        raise ValueError("working_days must be greater than zero")
    if lop_days < 0:
        raise ValueError("lop_days cannot be negative")
    if lop_days > working_days:
        raise ValueError("lop_days cannot exceed working_days")

    paid_days = working_days - lop_days
    multiplier = (paid_days / working_days) if lop_days > 0 else Decimal("1")

    # --- Pass 1: resolve earnings on the raw (un-prorated) basis ---
    raw_by_code: dict[str, Decimal] = {}
    raw_gross = Decimal("0")
    raw_lines: list[tuple[str, str, Decimal]] = []
    for line in structure.components or []:
        amt = _q(_resolve_amount(line, raw_by_code, raw_gross))
        code = line["code"]
        raw_by_code[code] = amt
        raw_gross += amt
        raw_lines.append((code, line.get("label", code), amt))

    # --- Apply LOP pro-ration uniformly to each earning line ---
    earnings: list[dict[str, Any]] = []
    by_code: dict[str, Decimal] = {}
    gross = Decimal("0.00")
    for code, label, raw in raw_lines:
        amt = _q(raw * multiplier)
        by_code[code] = amt
        gross = _q(gross + amt)
        earnings.append({"code": code, "label": label, "amount": float(amt)})

    # --- Deductions (resolved against prorated earnings + gross) ---
    deductions: list[dict[str, Any]] = []
    ded_ref: dict[str, Decimal] = dict(by_code)
    total_deductions = Decimal("0.00")
    for line in structure.default_deductions or []:
        amt = _q(_resolve_amount(line, ded_ref, gross))
        code = line["code"]
        ded_ref[code] = amt
        total_deductions = _q(total_deductions + amt)
        deductions.append({"code": code, "label": line.get("label", code), "amount": float(amt)})

    net_pay = _q(gross - total_deductions)

    return {
        "earnings": earnings,
        "deductions": deductions,
        "gross_earnings": gross,
        "total_deductions": total_deductions,
        "net_pay": net_pay,
        "lop_days": lop_days,
        "paid_days": paid_days,
    }


async def _load_cycle(
    db: AsyncSession, cycle_id: uuid.UUID, company_id: uuid.UUID
) -> PayrollCycle:
    stmt = select(PayrollCycle).where(
        PayrollCycle.id == cycle_id,
        PayrollCycle.company_id == company_id,
        PayrollCycle.deleted_at.is_(None),
    )
    cycle = (await db.execute(stmt)).scalar_one_or_none()
    if not cycle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Payroll cycle not found"
        )
    return cycle


def _cycle_brief(cycle: PayrollCycle) -> dict[str, Any]:
    totals = cycle.totals or {}
    return {
        "id": cycle.id,
        "name": cycle.name,
        "status": cycle.status,
        "period_start": cycle.period_start,
        "period_end": cycle.period_end,
        "pay_date": cycle.pay_date,
        "net": Decimal(str(totals.get("net", 0))),
        "headcount": int(totals.get("headcount", 0) or 0),
    }


async def dashboard_summary(
    db: AsyncSession, company_id: uuid.UUID
) -> dict[str, Any]:
    """Application-wide overview for the dashboard (all server-side, one call).

    Aggregates employees, salary configuration coverage, payroll-cycle status
    counts, money disbursed/pending, and the most recent cycles. Everything is
    scoped to the caller's company.
    """
    # --- Employees (active) ---
    employees = (
        await db.execute(
            select(Employee.id).where(
                Employee.company_id == company_id,
                Employee.deleted_at.is_(None),
            )
        )
    ).scalars().all()
    employee_ids = set(employees)

    # --- Active salary structures + which employees are configured ---
    structure_emp_ids = (
        await db.execute(
            select(SalaryStructure.employee_id).where(
                SalaryStructure.company_id == company_id,
                SalaryStructure.is_active.is_(True),
                SalaryStructure.deleted_at.is_(None),
            )
        )
    ).scalars().all()
    configured_ids = set(structure_emp_ids) & employee_ids
    active_structures = len(structure_emp_ids)

    # --- Cycles (non-deleted) ---
    cycles = (
        await db.execute(
            select(PayrollCycle)
            .where(
                PayrollCycle.company_id == company_id,
                PayrollCycle.deleted_at.is_(None),
            )
            .order_by(PayrollCycle.created_at.desc())
        )
    ).scalars().all()

    by_status: dict[str, int] = {s.value: 0 for s in PayrollCycleStatus}
    gross_paid = net_paid = pending_net = Decimal("0.00")
    payslips_paid = 0
    for cycle in cycles:
        by_status[cycle.status] = by_status.get(cycle.status, 0) + 1
        totals = cycle.totals or {}
        net = Decimal(str(totals.get("net", 0)))
        gross = Decimal(str(totals.get("gross", 0)))
        headcount = int(totals.get("headcount", 0) or 0)
        if cycle.status == PayrollCycleStatus.PAID.value:
            net_paid += net
            gross_paid += gross
            payslips_paid += headcount
        elif cycle.status in (
            PayrollCycleStatus.PROCESSING.value,
            PayrollCycleStatus.APPROVED.value,
        ):
            pending_net += net

    # Current = most recent cycle still in flight; else most recent overall.
    current = next(
        (
            c
            for c in cycles
            if c.status
            not in (PayrollCycleStatus.PAID.value, PayrollCycleStatus.CANCELLED.value)
        ),
        cycles[0] if cycles else None,
    )

    return {
        "employees": {
            "total": len(employee_ids),
            "configured": len(configured_ids),
            "missing": len(employee_ids - configured_ids),
        },
        "active_structures": active_structures,
        "cycles": {"total": len(cycles), "by_status": by_status},
        "payroll": {
            "gross_paid": gross_paid,
            "net_paid": net_paid,
            "payslips_paid": payslips_paid,
            "pending_net": pending_net,
        },
        "current_cycle": _cycle_brief(current) if current else None,
        "recent_cycles": [_cycle_brief(c) for c in cycles[:5]],
        "currency": "INR",
    }


async def run_payroll(
    db: AsyncSession, cycle_id: uuid.UUID, company_id: uuid.UUID
) -> dict[str, Any]:
    """Generate / refresh payslips for every active employee with a structure.

    Idempotent: upserts on (cycle_id, employee_id). Employees without an active
    salary structure are returned in `skipped` (never silently dropped).
    """
    cycle = await _load_cycle(db, cycle_id, company_id)

    if cycle.status not in (PayrollCycleStatus.DRAFT, PayrollCycleStatus.PROCESSING):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cycle must be DRAFT or PROCESSING to run (is {cycle.status})",
        )

    working_days = Decimal(DEFAULT_WORKING_DAYS)

    employees = (
        await db.execute(
            select(Employee).where(
                Employee.company_id == company_id,
                Employee.deleted_at.is_(None),
            )
        )
    ).scalars().all()

    created_count = 0
    updated_count = 0
    skipped: list[dict[str, Any]] = []

    for employee in employees:
        struct = (
            await db.execute(
                select(SalaryStructure).where(
                    SalaryStructure.employee_id == employee.id,
                    SalaryStructure.company_id == company_id,
                    SalaryStructure.is_active.is_(True),
                    SalaryStructure.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()

        if not struct:
            skipped.append(
                {"employee_id": employee.id, "reason": "no active salary structure"}
            )
            continue

        existing = (
            await db.execute(
                select(Payslip).where(
                    Payslip.cycle_id == cycle_id,
                    Payslip.employee_id == employee.id,
                )
            )
        ).scalar_one_or_none()

        # LOP is configured on the salary structure by HR; it drives proration.
        lop_days = Decimal(str(struct.lop_days or "0"))

        try:
            computed = compute_payslip(struct, lop_days, working_days)
        except ValueError as exc:
            skipped.append({"employee_id": employee.id, "reason": str(exc)})
            continue

        if existing:
            existing.gross_earnings = computed["gross_earnings"]
            existing.total_deductions = computed["total_deductions"]
            existing.net_pay = computed["net_pay"]
            existing.lop_days = lop_days
            existing.paid_days = computed["paid_days"]
            existing.earnings = computed["earnings"]
            existing.deductions = computed["deductions"]
            existing.currency = struct.currency
            existing.status = PayslipStatus.PENDING.value
            updated_count += 1
        else:
            db.add(
                Payslip(
                    company_id=company_id,
                    cycle_id=cycle_id,
                    employee_id=employee.id,
                    gross_earnings=computed["gross_earnings"],
                    total_deductions=computed["total_deductions"],
                    net_pay=computed["net_pay"],
                    lop_days=lop_days,
                    paid_days=computed["paid_days"],
                    earnings=computed["earnings"],
                    deductions=computed["deductions"],
                    currency=struct.currency,
                    status=PayslipStatus.PENDING.value,
                )
            )
            created_count += 1

    await db.flush()

    # Roll up totals from all payslips in the cycle.
    all_payslips = (
        await db.execute(select(Payslip).where(Payslip.cycle_id == cycle_id))
    ).scalars().all()

    total_gross = sum((p.gross_earnings for p in all_payslips), Decimal("0.00"))
    total_ded = sum((p.total_deductions for p in all_payslips), Decimal("0.00"))
    total_net = sum((p.net_pay for p in all_payslips), Decimal("0.00"))

    cycle.totals = {
        "headcount": len(all_payslips),
        "gross": float(total_gross),
        "deductions": float(total_ded),
        "net": float(total_net),
    }
    cycle.status = PayrollCycleStatus.PROCESSING.value

    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    return {"created": created_count, "updated": updated_count, "skipped": skipped}


async def approve_cycle(
    db: AsyncSession, cycle_id: uuid.UUID, company_id: uuid.UUID
) -> PayrollCycle:
    """PROCESSING -> APPROVED (locks payslips from re-run)."""
    cycle = await _load_cycle(db, cycle_id, company_id)
    if cycle.status != PayrollCycleStatus.PROCESSING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cycle must be PROCESSING to approve (is {cycle.status})",
        )
    cycle.status = PayrollCycleStatus.APPROVED.value
    try:
        await db.commit()
        await db.refresh(cycle)
    except Exception:
        await db.rollback()
        raise
    return cycle


async def mark_paid(
    db: AsyncSession, cycle_id: uuid.UUID, company_id: uuid.UUID
) -> PayrollCycle:
    """APPROVED -> PAID. Stamps every payslip paid_at + status PAID."""
    cycle = await _load_cycle(db, cycle_id, company_id)
    if cycle.status != PayrollCycleStatus.APPROVED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cycle must be APPROVED to mark paid (is {cycle.status})",
        )
    now = datetime.utcnow()
    cycle.status = PayrollCycleStatus.PAID.value
    await db.execute(
        update(Payslip)
        .where(Payslip.cycle_id == cycle_id)
        .values(status=PayslipStatus.PAID.value, paid_at=now)
    )
    try:
        await db.commit()
        await db.refresh(cycle)
    except Exception:
        await db.rollback()
        raise
    return cycle


async def cancel_cycle(
    db: AsyncSession, cycle_id: uuid.UUID, company_id: uuid.UUID
) -> PayrollCycle:
    """Any non-PAID status -> CANCELLED."""
    cycle = await _load_cycle(db, cycle_id, company_id)
    if cycle.status == PayrollCycleStatus.PAID:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A PAID cycle cannot be cancelled",
        )
    cycle.status = PayrollCycleStatus.CANCELLED.value
    try:
        await db.commit()
        await db.refresh(cycle)
    except Exception:
        await db.rollback()
        raise
    return cycle
