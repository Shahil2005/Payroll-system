import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from app.constants import Permission
from app.core.dependencies import DBSessionDep, get_current_company_id, require_permission
from app.models.company import Company
from app.schema.settings import OrganizationOut, OrganizationUpdate

router = APIRouter(prefix="/api/v1/enterprise/settings", tags=["settings"])


async def _load_company(db: DBSessionDep, company_id: uuid.UUID) -> Company:
    company = (
        await db.execute(
            select(Company).where(
                Company.id == company_id, Company.deleted_at.is_(None)
            )
        )
    ).scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    return company


@router.get("/organization", response_model=OrganizationOut)
async def get_organization(
    db: DBSessionDep,
    company_id: uuid.UUID = Depends(get_current_company_id),
    _: object = Depends(require_permission(Permission.PAYROLL_READ)),
) -> Company:
    """The signed-in user's organisation (Settings → Organisation Profile)."""
    return await _load_company(db, company_id)


@router.put("/organization", response_model=OrganizationOut)
async def update_organization(
    payload: OrganizationUpdate,
    db: DBSessionDep,
    company_id: uuid.UUID = Depends(get_current_company_id),
    _: object = Depends(require_permission(Permission.USERS_MANAGE)),
) -> Company:
    """Edit organisation profile. Admin-only (users:manage). Partial update —
    only the fields present in the request are changed."""
    company = await _load_company(db, company_id)
    fields = payload.model_dump(exclude_unset=True)
    non_nullable = {"name", "currency", "country"}
    for key, value in fields.items():
        if isinstance(value, str):
            value = value.strip()
            # Optional fields: blank -> NULL. Required fields keep their value.
            if value == "" and key not in non_nullable:
                value = None
        if key in ("pan", "tan") and value:
            value = value.upper()
        setattr(company, key, value)
    try:
        await db.commit()
        await db.refresh(company)
    except Exception:
        await db.rollback()
        raise
    return company
