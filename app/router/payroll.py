import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import select

from app.constants import DEFAULT_WORKING_DAYS, PayrollCycleStatus, Permission
from app.core.dependencies import DBSessionDep, get_current_company_id, require_permission
from app.models.company import Company
from app.models.employee import Employee
from app.models.payroll import PayrollCycle, Payslip, SalaryStructure
from app.schema.payroll import (
    BulkEmailResult,
    DashboardSummary,
    EmailResult,
    PayrollCycleCreate,
    PayrollCycleOut,
    PayslipDetailOut,
    PayslipOut,
    RunResult,
    SalaryStructureCreate,
    SalaryStructureOut,
    SalaryStructureUpdate,
)
from app.services import email_service, payroll_service, pdf_service

router = APIRouter(prefix="/api/v1/enterprise/payroll", tags=["payroll"])


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------
@router.get("/dashboard", response_model=DashboardSummary)
async def get_dashboard(
    db: DBSessionDep,
    company_id: uuid.UUID = Depends(get_current_company_id),
    _: object = Depends(require_permission(Permission.PAYROLL_READ)),
) -> dict:
    """Application-wide overview (employees, structures, cycles, money)."""
    return await payroll_service.dashboard_summary(db, company_id)


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
        lop_days=payload.lop_days,
        is_active=payload.is_active,
        pf_enabled=payload.pf_enabled,
        pf_cap_at_ceiling=payload.pf_cap_at_ceiling,
        pf_wage_codes=payload.pf_wage_codes,
        esi_enabled=payload.esi_enabled,
        pt_enabled=payload.pt_enabled,
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
    cycle = await payroll_service._load_cycle(db, id, company_id)
    # Payslips are only released once the cycle has been disbursed (marked PAID).
    if cycle.status != PayrollCycleStatus.PAID:
        return []
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
    # Payslips are only released once the cycle has been disbursed (marked PAID).
    cycle = await payroll_service._load_cycle(db, payslip.cycle_id, company_id)
    if cycle.status != PayrollCycleStatus.PAID:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This payslip is not available until the payroll cycle is marked as paid.",
        )
    return payslip


# ---------------------------------------------------------------------------
# Payslip PDF + email
# ---------------------------------------------------------------------------
async def _gather_payslip(
    db: DBSessionDep, payslip_id: uuid.UUID, company_id: uuid.UUID
) -> tuple[Payslip, PayrollCycle, Employee | None, Company | None]:
    """Load a payslip + its cycle/employee/company, enforcing the PAID gate.

    Mirrors ``get_payslip``: a payslip is only retrievable (and thus printable
    or emailable) once its cycle has been marked PAID.
    """
    payslip = (
        await db.execute(
            select(Payslip).where(Payslip.id == payslip_id, Payslip.company_id == company_id)
        )
    ).scalar_one_or_none()
    if not payslip:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payslip not found")
    cycle = await payroll_service._load_cycle(db, payslip.cycle_id, company_id)
    if cycle.status != PayrollCycleStatus.PAID:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This payslip is not available until the payroll cycle is marked as paid.",
        )
    employee = (
        await db.execute(select(Employee).where(Employee.id == payslip.employee_id))
    ).scalar_one_or_none()
    company = (
        await db.execute(select(Company).where(Company.id == company_id))
    ).scalar_one_or_none()
    return payslip, cycle, employee, company


def _render_pdf(
    payslip: Payslip, cycle: PayrollCycle, employee: Employee | None, company: Company | None
) -> bytes:
    emp_name = (
        f"{employee.first_name} {employee.last_name}".strip()
        if employee
        else str(payslip.employee_id)
    )
    return pdf_service.render_payslip_pdf(
        company_name=company.name if company else "Company",
        employee_name=emp_name,
        employee_email=employee.email if employee else "",
        ref=str(payslip.id)[:8],
        period_start=cycle.period_start,
        period_end=cycle.period_end,
        pay_date=cycle.pay_date,
        status=payslip.status,
        earnings=payslip.earnings or [],
        deductions=payslip.deductions or [],
        gross=payslip.gross_earnings,
        total_deductions=payslip.total_deductions,
        net=payslip.net_pay,
        lop_days=payslip.lop_days,
        paid_days=payslip.paid_days,
        working_days=DEFAULT_WORKING_DAYS,
        currency=payslip.currency,
        employer_contributions=payslip.employer_contributions or [],
    )


def _pdf_filename(cycle: PayrollCycle, employee: Employee | None, payslip: Payslip) -> str:
    who = (
        f"{employee.first_name}-{employee.last_name}".strip("-")
        if employee
        else str(payslip.employee_id)[:8]
    )
    safe_who = "".join(c if c.isalnum() or c in "-_" else "-" for c in who) or "employee"
    safe_cycle = "".join(c if c.isalnum() or c in "-_" else "-" for c in cycle.name) or "cycle"
    return f"payslip-{safe_who}-{safe_cycle}.pdf"


@router.get("/payslips/{id}/pdf")
async def download_payslip_pdf(
    id: uuid.UUID,
    db: DBSessionDep,
    company_id: uuid.UUID = Depends(get_current_company_id),
    _: object = Depends(require_permission(Permission.PAYROLL_READ)),
) -> Response:
    """Download the payslip as a server-rendered PDF (same artifact emailed)."""
    payslip, cycle, employee, company = await _gather_payslip(db, id, company_id)
    pdf = await run_in_threadpool(_render_pdf, payslip, cycle, employee, company)
    filename = _pdf_filename(cycle, employee, payslip)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/payslips/{id}/email", response_model=EmailResult)
async def email_payslip(
    id: uuid.UUID,
    db: DBSessionDep,
    company_id: uuid.UUID = Depends(get_current_company_id),
    _: object = Depends(require_permission(Permission.PAYROLL_PAY)),
) -> EmailResult:
    """Email the payslip (with PDF attached) to the employee's address."""
    payslip, cycle, employee, company = await _gather_payslip(db, id, company_id)
    if not employee or not employee.email:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="This employee has no email address on file.",
        )
    pdf = await run_in_threadpool(_render_pdf, payslip, cycle, employee, company)
    company_name = company.name if company else "Croar Payroll"
    html = email_service.payslip_email_html(
        employee_name=f"{employee.first_name} {employee.last_name}".strip(),
        company_name=company_name,
        period=f"{cycle.period_start} to {cycle.period_end}",
        net_pay=f"{payslip.currency} {float(payslip.net_pay):,.2f}",
    )
    try:
        await run_in_threadpool(
            email_service.send_payslip_email,
            to_email=employee.email,
            subject=f"Your payslip — {cycle.name}",
            html=html,
            pdf_bytes=pdf,
            filename=_pdf_filename(cycle, employee, payslip),
        )
    except email_service.EmailNotConfiguredError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except Exception as exc:  # surface any SDK/network failure as 502
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to send email: {exc}",
        ) from exc
    return EmailResult(sent=True, to=employee.email)


@router.post("/cycles/{id}/email-payslips", response_model=BulkEmailResult)
async def email_cycle_payslips(
    id: uuid.UUID,
    db: DBSessionDep,
    company_id: uuid.UUID = Depends(get_current_company_id),
    _: object = Depends(require_permission(Permission.PAYROLL_PAY)),
) -> BulkEmailResult:
    """Email every payslip in a PAID cycle to its employee.

    Best-effort: each payslip is attempted independently; failures (no email,
    send error) are collected and returned rather than aborting the batch.
    """
    cycle = await payroll_service._load_cycle(db, id, company_id)
    if cycle.status != PayrollCycleStatus.PAID:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Payslips can only be emailed once the cycle is marked as paid.",
        )
    if not email_service.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Email is not configured. Set SMTP_USERNAME, SMTP_PASSWORD and SMTP_FROM_EMAIL.",
        )

    payslips = (
        await db.execute(
            select(Payslip).where(Payslip.cycle_id == id, Payslip.company_id == company_id)
        )
    ).scalars().all()
    company = (
        await db.execute(select(Company).where(Company.id == company_id))
    ).scalar_one_or_none()
    company_name = company.name if company else "Croar Payroll"

    sent = 0
    failed: list[dict[str, object]] = []
    for slip in payslips:
        employee = (
            await db.execute(select(Employee).where(Employee.id == slip.employee_id))
        ).scalar_one_or_none()
        if not employee or not employee.email:
            failed.append(
                {
                    "payslip_id": slip.id,
                    "employee_id": slip.employee_id,
                    "reason": "no email address on file",
                }
            )
            continue
        pdf = await run_in_threadpool(_render_pdf, slip, cycle, employee, company)
        html = email_service.payslip_email_html(
            employee_name=f"{employee.first_name} {employee.last_name}".strip(),
            company_name=company_name,
            period=f"{cycle.period_start} to {cycle.period_end}",
            net_pay=f"{slip.currency} {float(slip.net_pay):,.2f}",
        )
        try:
            await run_in_threadpool(
                email_service.send_payslip_email,
                to_email=employee.email,
                subject=f"Your payslip — {cycle.name}",
                html=html,
                pdf_bytes=pdf,
                filename=_pdf_filename(cycle, employee, slip),
            )
            sent += 1
        except Exception as exc:  # collect per-payslip failures
            failed.append(
                {"payslip_id": slip.id, "employee_id": slip.employee_id, "reason": str(exc)}
            )
    return BulkEmailResult.model_validate({"sent": sent, "failed": failed})
