import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from app.constants import PayrollCycleStatus, Permission
from app.core.dependencies import (
    DBSessionDep,
    get_current_company_id,
    require_permission,
)
from app.models.payroll import PayrollCycle, Payslip, SalaryStructure
from app.schema.payroll import (
    PayrollCycleCreate,
    PayrollCycleOut,
    PayslipDetailOut,
    PayslipOut,
    RunResult,
    SalaryStructureCreate,
    SalaryStructureOut,
    SalaryStructureUpdate,
)
from app.services import payroll_service

router = APIRouter(prefix="/api/v1/enterprise/payroll", tags=["payroll"])


# ---------------------------------------------------------------------------
# Salary structures
# ---------------------------------------------------------------------------
@router.post(
    "/structures", response_model=SalaryStructureOut, status_code=status.HTTP_201_CREATED
)
async def create_salary_structure(
    payload: SalaryStructureCreate,
    db: DBSessionDep,
    company_id: uuid.UUID = Depends(get_current_company_id),
    _: object = Depends(require_permission(Permission.PAYROLL_CONFIGURE)),
) -> SalaryStructure:
    if payload.is_active:
        existing = (
            await db.execute(
                select(SalaryStructure).where(
                    SalaryStructure.employee_id == payload.employee_id,
                    SalaryStructure.company_id == company_id,
                    SalaryStructure.is_active.is_(True),
                    SalaryStructure.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Employee already has an active salary structure.",
            )

    struct = SalaryStructure(
        company_id=company_id,
        employee_id=payload.employee_id,
        ctc=payload.ctc,
        currency=payload.currency,
        pay_frequency=payload.pay_frequency.value,
        effective_from=payload.effective_from,
        components=[c.model_dump(mode="json") for c in payload.components],
        default_deductions=[d.model_dump(mode="json") for d in payload.default_deductions],
        is_active=payload.is_active,
    )
    db.add(struct)
    try:
        await db.commit()
        await db.refresh(struct)
    except Exception:
        await db.rollback()
        raise
    return struct


@router.get("/structures", response_model=list[SalaryStructureOut])
async def list_salary_structures(
    db: DBSessionDep,
    employee_id: uuid.UUID | None = None,
    company_id: uuid.UUID = Depends(get_current_company_id),
    _: object = Depends(require_permission(Permission.PAYROLL_READ)),
) -> list[SalaryStructure]:
    stmt = select(SalaryStructure).where(
        SalaryStructure.company_id == company_id,
        SalaryStructure.deleted_at.is_(None),
    )
    if employee_id is not None:
        stmt = stmt.where(SalaryStructure.employee_id == employee_id)
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows)


@router.get("/structures/{id}", response_model=SalaryStructureOut)
async def get_salary_structure(
    id: uuid.UUID,
    db: DBSessionDep,
    company_id: uuid.UUID = Depends(get_current_company_id),
    _: object = Depends(require_permission(Permission.PAYROLL_READ)),
) -> SalaryStructure:
    struct = (
        await db.execute(
            select(SalaryStructure).where(
                SalaryStructure.id == id,
                SalaryStructure.company_id == company_id,
                SalaryStructure.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if not struct:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Salary structure not found")
    return struct


@router.put("/structures/{id}", response_model=SalaryStructureOut)
async def update_salary_structure(
    id: uuid.UUID,
    payload: SalaryStructureUpdate,
    db: DBSessionDep,
    company_id: uuid.UUID = Depends(get_current_company_id),
    _: object = Depends(require_permission(Permission.PAYROLL_CONFIGURE)),
) -> SalaryStructure:
    struct = (
        await db.execute(
            select(SalaryStructure).where(
                SalaryStructure.id == id,
                SalaryStructure.company_id == company_id,
                SalaryStructure.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if not struct:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Salary structure not found")

    if payload.is_active is True and struct.is_active is not True:
        clash = (
            await db.execute(
                select(SalaryStructure).where(
                    SalaryStructure.employee_id == struct.employee_id,
                    SalaryStructure.company_id == company_id,
                    SalaryStructure.is_active.is_(True),
                    SalaryStructure.deleted_at.is_(None),
                    SalaryStructure.id != id,
                )
            )
        ).scalar_one_or_none()
        if clash:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Employee already has an active salary structure.",
            )

    update_fields = payload.model_dump(exclude_unset=True)
    if payload.components is not None:
        update_fields["components"] = [c.model_dump(mode="json") for c in payload.components]
    if payload.default_deductions is not None:
        update_fields["default_deductions"] = [
            d.model_dump(mode="json") for d in payload.default_deductions
        ]
    if payload.pay_frequency is not None:
        update_fields["pay_frequency"] = payload.pay_frequency.value

    for field, value in update_fields.items():
        setattr(struct, field, value)
    try:
        await db.commit()
        await db.refresh(struct)
    except Exception:
        await db.rollback()
        raise
    return struct


@router.delete("/structures/{id}", response_model=SalaryStructureOut)
async def delete_salary_structure(
    id: uuid.UUID,
    db: DBSessionDep,
    company_id: uuid.UUID = Depends(get_current_company_id),
    _: object = Depends(require_permission(Permission.PAYROLL_CONFIGURE)),
) -> SalaryStructure:
    struct = (
        await db.execute(
            select(SalaryStructure).where(
                SalaryStructure.id == id,
                SalaryStructure.company_id == company_id,
                SalaryStructure.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if not struct:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Salary structure not found")
    struct.deleted_at = datetime.utcnow()
    struct.is_active = False
    try:
        await db.commit()
        await db.refresh(struct)
    except Exception:
        await db.rollback()
        raise
    return struct


# ---------------------------------------------------------------------------
# Payroll cycles
# ---------------------------------------------------------------------------
@router.post("/cycles", response_model=PayrollCycleOut, status_code=status.HTTP_201_CREATED)
async def create_payroll_cycle(
    payload: PayrollCycleCreate,
    db: DBSessionDep,
    company_id: uuid.UUID = Depends(get_current_company_id),
    _: object = Depends(require_permission(Permission.PAYROLL_CONFIGURE)),
) -> PayrollCycle:
    cycle = PayrollCycle(
        company_id=company_id,
        name=payload.name,
        period_start=payload.period_start,
        period_end=payload.period_end,
        pay_date=payload.pay_date,
        notes=payload.notes,
        status=PayrollCycleStatus.DRAFT.value,
        totals={},
    )
    db.add(cycle)
    try:
        await db.commit()
        await db.refresh(cycle)
    except Exception:
        await db.rollback()
        raise
    return cycle


@router.get("/cycles", response_model=list[PayrollCycleOut])
async def list_payroll_cycles(
    db: DBSessionDep,
    company_id: uuid.UUID = Depends(get_current_company_id),
    _: object = Depends(require_permission(Permission.PAYROLL_READ)),
) -> list[PayrollCycle]:
    rows = (
        await db.execute(
            select(PayrollCycle)
            .where(
                PayrollCycle.company_id == company_id,
                PayrollCycle.deleted_at.is_(None),
            )
            .order_by(PayrollCycle.created_at.desc())
        )
    ).scalars().all()
    return list(rows)


@router.get("/cycles/{id}", response_model=PayrollCycleOut)
async def get_payroll_cycle(
    id: uuid.UUID,
    db: DBSessionDep,
    company_id: uuid.UUID = Depends(get_current_company_id),
    _: object = Depends(require_permission(Permission.PAYROLL_READ)),
) -> PayrollCycle:
    return await payroll_service._load_cycle(db, id, company_id)


@router.post("/cycles/{id}/run", response_model=RunResult)
async def run_payroll_cycle(
    id: uuid.UUID,
    db: DBSessionDep,
    company_id: uuid.UUID = Depends(get_current_company_id),
    _: object = Depends(require_permission(Permission.PAYROLL_RUN)),
) -> dict:
    return await payroll_service.run_payroll(db, id, company_id)


@router.post("/cycles/{id}/approve", response_model=PayrollCycleOut)
async def approve_payroll_cycle(
    id: uuid.UUID,
    db: DBSessionDep,
    company_id: uuid.UUID = Depends(get_current_company_id),
    _: object = Depends(require_permission(Permission.PAYROLL_APPROVE)),
) -> PayrollCycle:
    return await payroll_service.approve_cycle(db, id, company_id)


@router.post("/cycles/{id}/mark-paid", response_model=PayrollCycleOut)
async def mark_payroll_cycle_paid(
    id: uuid.UUID,
    db: DBSessionDep,
    company_id: uuid.UUID = Depends(get_current_company_id),
    _: object = Depends(require_permission(Permission.PAYROLL_PAY)),
) -> PayrollCycle:
    return await payroll_service.mark_paid(db, id, company_id)


@router.post("/cycles/{id}/cancel", response_model=PayrollCycleOut)
async def cancel_payroll_cycle(
    id: uuid.UUID,
    db: DBSessionDep,
    company_id: uuid.UUID = Depends(get_current_company_id),
    _: object = Depends(require_permission(Permission.PAYROLL_MANAGE)),
) -> PayrollCycle:
    return await payroll_service.cancel_cycle(db, id, company_id)


@router.delete("/cycles/{id}", response_model=PayrollCycleOut)
async def delete_payroll_cycle(
    id: uuid.UUID,
    db: DBSessionDep,
    company_id: uuid.UUID = Depends(get_current_company_id),
    _: object = Depends(require_permission(Permission.PAYROLL_MANAGE)),
) -> PayrollCycle:
    """Soft-delete a cycle. Allowed for any status except PAID (spec §6)."""
    cycle = await payroll_service._load_cycle(db, id, company_id)
    if cycle.status == PayrollCycleStatus.PAID:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A PAID cycle cannot be deleted",
        )
    cycle.deleted_at = datetime.utcnow()
    try:
        await db.commit()
        await db.refresh(cycle)
    except Exception:
        await db.rollback()
        raise
    return cycle


# ---------------------------------------------------------------------------
# Payslips
# ---------------------------------------------------------------------------
@router.get("/cycles/{id}/payslips", response_model=list[PayslipOut])
async def list_cycle_payslips(
    id: uuid.UUID,
    db: DBSessionDep,
    company_id: uuid.UUID = Depends(get_current_company_id),
    _: object = Depends(require_permission(Permission.PAYROLL_READ)),
) -> list[Payslip]:
    await payroll_service._load_cycle(db, id, company_id)
    rows = (
        await db.execute(
            select(Payslip).where(
                Payslip.cycle_id == id, Payslip.company_id == company_id
            )
        )
    ).scalars().all()
    return list(rows)


@router.get("/payslips/{id}", response_model=PayslipDetailOut)
async def get_payslip(
    id: uuid.UUID,
    db: DBSessionDep,
    company_id: uuid.UUID = Depends(get_current_company_id),
    _: object = Depends(require_permission(Permission.PAYROLL_READ)),
) -> Payslip:
    payslip = (
        await db.execute(
            select(Payslip).where(Payslip.id == id, Payslip.company_id == company_id)
        )
    ).scalar_one_or_none()
    if not payslip:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payslip not found")
    return payslip
