from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from app.constants import PayrollCycleStatus
from app.core.dependencies import DBSessionDep, get_current_company_id
from app.models.payroll import PayrollCycle, Payslip, SalaryStructure
from app.schema.payroll import (
    PayrollCycleCreate,
    PayrollCycleResponse,
    PayslipDetailResponse,
    PayslipResponse,
    SalaryStructureCreate,
    SalaryStructureResponse,
    SalaryStructureUpdate,
)
from app.services import payroll_service

router = APIRouter(prefix="/api/v1/payroll", tags=["payroll"])


# --- Salary Structure Endpoints ---
@router.post(
    "/structures",
    response_model=SalaryStructureResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_salary_structure(
    payload: SalaryStructureCreate,
    db: DBSessionDep,
    company_id: int = Depends(get_current_company_id),
) -> SalaryStructure:
    """Create a new salary structure.
    
    Validates that only one active structure exists per employee.
    """
    if payload.is_active:
        stmt = select(SalaryStructure).where(
            SalaryStructure.employee_id == payload.employee_id,
            SalaryStructure.company_id == company_id,
            SalaryStructure.is_active == True,  # noqa: E712
            SalaryStructure.deleted_at == None,  # noqa: E711
        )
        res = await db.execute(stmt)
        existing = res.scalar_one_or_none()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Employee already has an active salary structure in this company.",
            )

    new_struct = SalaryStructure(
        company_id=company_id,
        employee_id=payload.employee_id,
        ctc=payload.ctc,
        currency=payload.currency,
        pay_frequency=payload.pay_frequency,
        effective_from=payload.effective_from,
        components=payload.components,
        default_deductions=payload.default_deductions,
        is_active=payload.is_active,
    )
    db.add(new_struct)
    try:
        await db.commit()
        await db.refresh(new_struct)
    except Exception:
        await db.rollback()
        raise
    return new_struct


@router.get("/structures", response_model=list[SalaryStructureResponse])
async def get_salary_structures(
    db: DBSessionDep,
    company_id: int = Depends(get_current_company_id),
) -> list[SalaryStructure]:
    """Retrieve all non-deleted salary structures for the current company."""
    stmt = select(SalaryStructure).where(
        SalaryStructure.company_id == company_id,
        SalaryStructure.deleted_at == None,  # noqa: E711
    )
    res = await db.execute(stmt)
    return list(res.scalars().all())


@router.get("/structures/{id}", response_model=SalaryStructureResponse)
async def get_salary_structure(
    id: int,
    db: DBSessionDep,
    company_id: int = Depends(get_current_company_id),
) -> SalaryStructure:
    """Retrieve details of a specific non-deleted salary structure."""
    stmt = select(SalaryStructure).where(
        SalaryStructure.id == id,
        SalaryStructure.company_id == company_id,
        SalaryStructure.deleted_at == None,  # noqa: E711
    )
    res = await db.execute(stmt)
    struct = res.scalar_one_or_none()
    if not struct:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Salary structure not found or has been deleted",
        )
    return struct


@router.put("/structures/{id}", response_model=SalaryStructureResponse)
async def update_salary_structure(
    id: int,
    payload: SalaryStructureUpdate,
    db: DBSessionDep,
    company_id: int = Depends(get_current_company_id),
) -> SalaryStructure:
    """Update field values of an existing salary structure."""
    stmt = select(SalaryStructure).where(
        SalaryStructure.id == id,
        SalaryStructure.company_id == company_id,
        SalaryStructure.deleted_at == None,  # noqa: E711
    )
    res = await db.execute(stmt)
    struct = res.scalar_one_or_none()
    if not struct:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Salary structure not found",
        )

    # Validate active constraint if is_active is toggled to True
    if payload.is_active is True and struct.is_active is not True:
        stmt_check = select(SalaryStructure).where(
            SalaryStructure.employee_id == struct.employee_id,
            SalaryStructure.company_id == company_id,
            SalaryStructure.is_active == True,  # noqa: E712
            SalaryStructure.deleted_at == None,  # noqa: E711
            SalaryStructure.id != id,
        )
        res_check = await db.execute(stmt_check)
        existing = res_check.scalar_one_or_none()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Employee already has an active salary structure in this company.",
            )

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(struct, field, value)

    try:
        await db.commit()
        await db.refresh(struct)
    except Exception:
        await db.rollback()
        raise
    return struct


@router.delete("/structures/{id}", response_model=SalaryStructureResponse)
async def delete_salary_structure(
    id: int,
    db: DBSessionDep,
    company_id: int = Depends(get_current_company_id),
) -> SalaryStructure:
    """Perform soft-deletion of a salary structure by setting deleted_at and deactivating."""
    stmt = select(SalaryStructure).where(
        SalaryStructure.id == id,
        SalaryStructure.company_id == company_id,
        SalaryStructure.deleted_at == None,  # noqa: E711
    )
    res = await db.execute(stmt)
    struct = res.scalar_one_or_none()
    if not struct:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Salary structure not found",
        )

    struct.deleted_at = datetime.utcnow()
    struct.is_active = False
    try:
        await db.commit()
        await db.refresh(struct)
    except Exception:
        await db.rollback()
        raise
    return struct


# --- Payroll Cycle Endpoints ---
@router.post(
    "/cycles",
    response_model=PayrollCycleResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_payroll_cycle(
    payload: PayrollCycleCreate,
    db: DBSessionDep,
    company_id: int = Depends(get_current_company_id),
) -> PayrollCycle:
    """Create a new payroll cycle in DRAFT state."""
    new_cycle = PayrollCycle(
        company_id=company_id,
        name=payload.name,
        period_start=payload.period_start,
        period_end=payload.period_end,
        pay_date=payload.pay_date,
        notes=payload.notes,
        status=PayrollCycleStatus.DRAFT,
        totals={},
    )
    db.add(new_cycle)
    try:
        await db.commit()
        await db.refresh(new_cycle)
    except Exception:
        await db.rollback()
        raise
    return new_cycle


@router.get("/cycles", response_model=list[PayrollCycleResponse])
async def get_payroll_cycles(
    db: DBSessionDep,
    company_id: int = Depends(get_current_company_id),
) -> list[PayrollCycle]:
    """Retrieve all payroll cycles for the current company."""
    stmt = select(PayrollCycle).where(PayrollCycle.company_id == company_id)
    res = await db.execute(stmt)
    return list(res.scalars().all())


@router.get("/cycles/{id}", response_model=PayrollCycleResponse)
async def get_payroll_cycle(
    id: int,
    db: DBSessionDep,
    company_id: int = Depends(get_current_company_id),
) -> PayrollCycle:
    """Retrieve details of a specific payroll cycle."""
    stmt = select(PayrollCycle).where(
        PayrollCycle.id == id, PayrollCycle.company_id == company_id
    )
    res = await db.execute(stmt)
    cycle = res.scalar_one_or_none()
    if not cycle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payroll cycle not found",
        )
    return cycle


@router.post("/cycles/{id}/run")
async def run_payroll_cycle(
    id: int,
    db: DBSessionDep,
    company_id: int = Depends(get_current_company_id),
) -> dict[str, Any]:
    """Execute/run payroll calculations for all active employees for this cycle."""
    # Ensure cycle exists and belongs to company
    stmt = select(PayrollCycle).where(
        PayrollCycle.id == id, PayrollCycle.company_id == company_id
    )
    res = await db.execute(stmt)
    cycle = res.scalar_one_or_none()
    if not cycle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payroll cycle not found",
        )

    return await payroll_service.run_payroll(db, id)


@router.post("/cycles/{id}/approve", response_model=PayrollCycleResponse)
async def approve_payroll_cycle(
    id: int,
    db: DBSessionDep,
    company_id: int = Depends(get_current_company_id),
) -> PayrollCycle:
    """Transition cycle status from PROCESSING to APPROVED."""
    stmt = select(PayrollCycle).where(
        PayrollCycle.id == id, PayrollCycle.company_id == company_id
    )
    res = await db.execute(stmt)
    cycle = res.scalar_one_or_none()
    if not cycle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payroll cycle not found",
        )

    return await payroll_service.approve_cycle(db, id)


@router.post("/cycles/{id}/mark-paid", response_model=PayrollCycleResponse)
async def mark_payroll_cycle_paid(
    id: int,
    db: DBSessionDep,
    company_id: int = Depends(get_current_company_id),
) -> PayrollCycle:
    """Transition cycle status from APPROVED to PAID, and mark all cycle payslips as PAID."""
    stmt = select(PayrollCycle).where(
        PayrollCycle.id == id, PayrollCycle.company_id == company_id
    )
    res = await db.execute(stmt)
    cycle = res.scalar_one_or_none()
    if not cycle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payroll cycle not found",
        )

    return await payroll_service.mark_paid(db, id)


@router.delete("/cycles/{id}", response_model=PayrollCycleResponse)
async def delete_payroll_cycle(
    id: int,
    db: DBSessionDep,
    company_id: int = Depends(get_current_company_id),
) -> PayrollCycle:
    """Delete a payroll cycle. Only draft cycles are permitted to be deleted."""
    stmt = select(PayrollCycle).where(
        PayrollCycle.id == id, PayrollCycle.company_id == company_id
    )
    res = await db.execute(stmt)
    cycle = res.scalar_one_or_none()
    if not cycle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payroll cycle not found",
        )

    if cycle.status != PayrollCycleStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only draft cycles can be deleted",
        )

    await db.delete(cycle)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    return cycle


# --- Payslip Endpoints ---
@router.get("/cycles/{id}/payslips", response_model=list[PayslipResponse])
async def get_cycle_payslips(
    id: int,
    db: DBSessionDep,
    company_id: int = Depends(get_current_company_id),
) -> list[Payslip]:
    """Retrieve all payslips associated with the specified payroll cycle."""
    stmt_cycle = select(PayrollCycle).where(
        PayrollCycle.id == id, PayrollCycle.company_id == company_id
    )
    res_cycle = await db.execute(stmt_cycle)
    cycle = res_cycle.scalar_one_or_none()
    if not cycle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payroll cycle not found",
        )

    stmt = select(Payslip).where(
        Payslip.cycle_id == id, Payslip.company_id == company_id
    )
    res = await db.execute(stmt)
    return list(res.scalars().all())


@router.get("/payslips/{id}", response_model=PayslipDetailResponse)
async def get_payslip(
    id: int,
    db: DBSessionDep,
    company_id: int = Depends(get_current_company_id),
) -> Payslip:
    """Retrieve detailed information of a specific payslip, including components breakdown."""
    stmt = select(Payslip).where(
        Payslip.id == id, Payslip.company_id == company_id
    )
    res = await db.execute(stmt)
    payslip = res.scalar_one_or_none()
    if not payslip:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payslip not found",
        )
    return payslip
