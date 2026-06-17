import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from app.constants import Permission
from app.core.dependencies import DBSessionDep, get_current_company_id, require_permission
from app.models.employee import Employee
from app.models.payroll import SalaryStructure
from app.schema.employee import EmployeeCreate, EmployeeOut, EmployeeUpdate

router = APIRouter(prefix="/api/v1/enterprise/employees", tags=["employees"])


@router.post("", response_model=EmployeeOut, status_code=status.HTTP_201_CREATED)
async def create_employee(
    payload: EmployeeCreate,
    db: DBSessionDep,
    company_id: uuid.UUID = Depends(get_current_company_id),
    _: object = Depends(require_permission(Permission.PAYROLL_CONFIGURE)),
) -> Employee:
    """Add an employee to the current company."""
    existing = (
        await db.execute(
            select(Employee).where(
                Employee.company_id == company_id,
                Employee.email == payload.email,
                Employee.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An employee with this email already exists in this company.",
        )

    employee = Employee(company_id=company_id, **payload.model_dump())
    db.add(employee)
    try:
        await db.commit()
        await db.refresh(employee)
    except IntegrityError:
        # Backstop for the unique (company_id, email) constraint — covers an
        # email still held by a soft-deleted employee, or a concurrent insert
        # that slips past the check above.
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An employee with this email already exists in this company.",
        )
    except Exception:
        await db.rollback()
        raise
    return employee


@router.get("", response_model=list[EmployeeOut])
async def list_employees(
    db: DBSessionDep,
    company_id: uuid.UUID = Depends(get_current_company_id),
    _: object = Depends(require_permission(Permission.PAYROLL_READ)),
) -> list[Employee]:
    """List active (non-deleted) employees of the current company."""
    rows = (
        await db.execute(
            select(Employee)
            .where(Employee.company_id == company_id, Employee.deleted_at.is_(None))
            .order_by(Employee.created_at)
        )
    ).scalars().all()
    return list(rows)


@router.get("/{id}", response_model=EmployeeOut)
async def get_employee(
    id: uuid.UUID,
    db: DBSessionDep,
    company_id: uuid.UUID = Depends(get_current_company_id),
    _: object = Depends(require_permission(Permission.PAYROLL_READ)),
) -> Employee:
    emp = (
        await db.execute(
            select(Employee).where(
                Employee.id == id,
                Employee.company_id == company_id,
                Employee.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found.")
    return emp


@router.put("/{id}", response_model=EmployeeOut)
async def update_employee(
    id: uuid.UUID,
    payload: EmployeeUpdate,
    db: DBSessionDep,
    company_id: uuid.UUID = Depends(get_current_company_id),
    _: object = Depends(require_permission(Permission.PAYROLL_CONFIGURE)),
) -> Employee:
    emp = (
        await db.execute(
            select(Employee).where(
                Employee.id == id,
                Employee.company_id == company_id,
                Employee.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found.")

    fields = payload.model_dump(exclude_unset=True)
    # Block changing the email to one another active employee already uses.
    if "email" in fields and fields["email"] != emp.email:
        clash = (
            await db.execute(
                select(Employee).where(
                    Employee.company_id == company_id,
                    Employee.email == fields["email"],
                    Employee.id != id,
                    Employee.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if clash:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An employee with this email already exists in this company.",
            )

    for field, value in fields.items():
        setattr(emp, field, value)
    try:
        await db.commit()
        await db.refresh(emp)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An employee with this email already exists in this company.",
        )
    except Exception:
        await db.rollback()
        raise
    return emp


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_employee(
    id: uuid.UUID,
    db: DBSessionDep,
    company_id: uuid.UUID = Depends(get_current_company_id),
    _: object = Depends(require_permission(Permission.PAYROLL_CONFIGURE)),
) -> None:
    """Soft-delete an employee. Historical payslips are preserved (the row
    stays in the DB); the employee is excluded from listings and future runs."""
    emp = (
        await db.execute(
            select(Employee).where(
                Employee.id == id,
                Employee.company_id == company_id,
                Employee.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found.")

    now = datetime.utcnow()
    emp.deleted_at = now
    # Deactivate their active salary structures so they are excluded from future runs.
    await db.execute(
        update(SalaryStructure)
        .where(
            SalaryStructure.employee_id == id,
            SalaryStructure.deleted_at.is_(None),
        )
        .values(is_active=False, deleted_at=now)
    )
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    return
