from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import PayrollCycleStatus, PayslipStatus
from app.models.payroll import PayrollCycle, Payslip, SalaryStructure
from app.models.user import User


def quantize_money(amount: Decimal) -> Decimal:
    """Helper to round a Decimal amount to 2 decimal places using ROUND_HALF_UP."""
    return amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def compute_payslip(
    salary_structure: SalaryStructure,
    lop_days: Decimal,
    working_days: Decimal,
) -> dict[str, Any]:
    """Calculate an employee's monthly payslip snapshot based on salary structure and LOP days.
    
    All calculations use Decimal arithmetic and round to 2 decimal places (ROUND_HALF_UP).
    """
    if working_days <= 0:
        raise ValueError("Working days must be greater than zero")
    if lop_days < 0:
        raise ValueError("LOP days cannot be negative")
    if lop_days > working_days:
        raise ValueError("LOP days cannot exceed working days")

    # 1. Calculate paid days
    paid_days = working_days - lop_days
    proration_multiplier = paid_days / working_days

    # 2. Resolve and calculate earnings components
    earnings: dict[str, Any] = {}
    total_gross = Decimal("0.00")
    ctc = salary_structure.ctc

    for comp_name, comp_data in salary_structure.components.items():
        comp_type = comp_data.get("type")
        comp_val = Decimal(str(comp_data.get("value", "0")))

        if comp_type == "fixed":
            base_amt = comp_val
        elif comp_type == "percentage":
            # Percentage components are defined relative to monthly CTC (CTC / 12)
            base_amt = (comp_val / Decimal("100")) * (ctc / Decimal("12"))
        else:
            base_amt = Decimal("0.00")

        # Apply LOP proration
        prorated_amt = quantize_money(base_amt * proration_multiplier)
        earnings[comp_name] = float(prorated_amt)
        total_gross += prorated_amt

    total_gross = quantize_money(total_gross)

    # 3. Resolve and calculate deductions components
    deductions: dict[str, Any] = {}
    total_deductions = Decimal("0.00")

    for ded_name, ded_data in salary_structure.default_deductions.items():
        ded_type = ded_data.get("type")
        ded_val = Decimal(str(ded_data.get("value", "0")))

        if ded_type == "fixed":
            base_ded = ded_val
        elif ded_type == "percentage":
            # Deductions percentage is based on actual calculated gross earnings
            base_ded = (ded_val / Decimal("100")) * total_gross
        else:
            base_ded = Decimal("0.00")

        ded_amt = quantize_money(base_ded)
        deductions[ded_name] = float(ded_amt)
        total_deductions += ded_amt

    total_deductions = quantize_money(total_deductions)

    # 4. Calculate Net Pay
    net_pay = quantize_money(total_gross - total_deductions)

    return {
        "earnings": earnings,
        "deductions": deductions,
        "gross_earnings": total_gross,
        "total_deductions": total_deductions,
        "net_pay": net_pay,
        "lop_days": lop_days,
        "paid_days": paid_days,
    }


async def run_payroll(db: AsyncSession, cycle_id: int) -> dict[str, Any]:
    """Execute payroll run for all active employees of the cycle's company.
    
    Idempotently inserts or updates payslips for the cycle, updates the cycle totals,
    and transitions the cycle status to PROCESSING.
    """
    # Load payroll cycle
    stmt = select(PayrollCycle).where(PayrollCycle.id == cycle_id)
    res = await db.execute(stmt)
    cycle = res.scalar_one_or_none()
    if not cycle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Payroll cycle with ID {cycle_id} not found",
        )

    # Only DRAFT status is allowed for run
    if cycle.status != PayrollCycleStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cycle cannot be run because it is in {cycle.status} status (must be DRAFT)",
        )

    # Load all users
    user_stmt = select(User)
    user_res = await db.execute(user_stmt)
    users = user_res.scalars().all()

    created_count = 0
    updated_count = 0
    skipped: list[dict[str, Any]] = []

    working_days = Decimal((cycle.period_end - cycle.period_start).days + 1)
    if working_days <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid cycle period start/end dates: resulting working days is {working_days}",
        )

    # For each user, retrieve their active salary structure and compute payslip
    for user in users:
        struct_stmt = select(SalaryStructure).where(
            SalaryStructure.employee_id == user.id,
            SalaryStructure.company_id == cycle.company_id,
            SalaryStructure.is_active == True,  # noqa: E712
            SalaryStructure.deleted_at == None,  # noqa: E711
        )
        struct_res = await db.execute(struct_stmt)
        salary_struct = struct_res.scalar_one_or_none()

        if not salary_struct:
            skipped.append(
                {
                    "employee_id": user.id,
                    "reason": f"No active salary structure found for employee ID {user.id} and company ID {cycle.company_id}",
                }
            )
            continue

        # Look up if payslip already exists to preserve manual LOP days input
        payslip_stmt = select(Payslip).where(
            Payslip.cycle_id == cycle_id,
            Payslip.employee_id == user.id,
        )
        payslip_res = await db.execute(payslip_stmt)
        existing_payslip = payslip_res.scalar_one_or_none()

        lop_days = existing_payslip.lop_days if existing_payslip else Decimal("0.0")

        try:
            computed = compute_payslip(salary_struct, lop_days, working_days)
        except ValueError as e:
            skipped.append({"employee_id": user.id, "reason": str(e)})
            continue

        if existing_payslip:
            existing_payslip.gross_earnings = computed["gross_earnings"]
            existing_payslip.total_deductions = computed["total_deductions"]
            existing_payslip.net_pay = computed["net_pay"]
            existing_payslip.paid_days = computed["paid_days"]
            existing_payslip.earnings = computed["earnings"]
            existing_payslip.deductions = computed["deductions"]
            existing_payslip.currency = salary_struct.currency
            existing_payslip.status = PayslipStatus.PENDING
            updated_count += 1
        else:
            new_payslip = Payslip(
                company_id=cycle.company_id,
                cycle_id=cycle_id,
                employee_id=user.id,
                gross_earnings=computed["gross_earnings"],
                total_deductions=computed["total_deductions"],
                net_pay=computed["net_pay"],
                lop_days=lop_days,
                paid_days=computed["paid_days"],
                earnings=computed["earnings"],
                deductions=computed["deductions"],
                currency=salary_struct.currency,
                status=PayslipStatus.PENDING,
            )
            db.add(new_payslip)
            created_count += 1

    # Flush changes to make sure they are in the session database state for aggregation
    await db.flush()

    # Aggregate cycle totals
    payslips_stmt = select(Payslip).where(Payslip.cycle_id == cycle_id)
    payslips_res = await db.execute(payslips_stmt)
    all_payslips = payslips_res.scalars().all()

    total_gross = sum((p.gross_earnings for p in all_payslips), Decimal("0.00"))
    total_ded = sum((p.total_deductions for p in all_payslips), Decimal("0.00"))
    total_net = sum((p.net_pay for p in all_payslips), Decimal("0.00"))

    cycle.totals = {
        "gross_earnings": float(total_gross),
        "total_deductions": float(total_ded),
        "net_pay": float(total_net),
    }
    cycle.status = PayrollCycleStatus.PROCESSING

    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    return {
        "created": created_count,
        "updated": updated_count,
        "skipped": skipped,
    }


async def approve_cycle(db: AsyncSession, cycle_id: int) -> PayrollCycle:
    """Approve a processing payroll cycle."""
    stmt = select(PayrollCycle).where(PayrollCycle.id == cycle_id)
    res = await db.execute(stmt)
    cycle = res.scalar_one_or_none()
    if not cycle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Payroll cycle with ID {cycle_id} not found",
        )

    if cycle.status != PayrollCycleStatus.PROCESSING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cycle cannot be approved from its current status: {cycle.status} (must be PROCESSING)",
        )

    cycle.status = PayrollCycleStatus.APPROVED

    try:
        await db.commit()
        await db.refresh(cycle)
    except Exception:
        await db.rollback()
        raise

    return cycle


async def mark_paid(db: AsyncSession, cycle_id: int) -> PayrollCycle:
    """Mark an approved payroll cycle as paid and update all cycle payslips to PAID status."""
    stmt = select(PayrollCycle).where(PayrollCycle.id == cycle_id)
    res = await db.execute(stmt)
    cycle = res.scalar_one_or_none()
    if not cycle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Payroll cycle with ID {cycle_id} not found",
        )

    if cycle.status != PayrollCycleStatus.APPROVED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cycle cannot be marked as paid from its current status: {cycle.status} (must be APPROVED)",
        )

    now = datetime.utcnow()
    cycle.status = PayrollCycleStatus.PAID
    cycle.paid_at = now

    # Bulk update all payslips associated with the cycle to PAID
    update_stmt = (
        update(Payslip)
        .where(Payslip.cycle_id == cycle_id)
        .values(status=PayslipStatus.PAID, paid_at=now)
    )
    await db.execute(update_stmt)

    try:
        await db.commit()
        await db.refresh(cycle)
    except Exception:
        await db.rollback()
        raise

    return cycle
