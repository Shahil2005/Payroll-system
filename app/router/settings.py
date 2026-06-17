import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from sqlalchemy import select

from app.constants import Permission
from app.core.dependencies import DBSessionDep, get_current_company_id, require_permission
from app.models.company import Company
from app.schema.settings import (
    OrganizationOut,
    OrganizationUpdate,
    PayslipSettings,
    PayslipSettingsOut,
    PayslipSettingsUpdate,
    StatutoryConfig,
    StatutoryConfigUpdate,
)
from app.services import docx_service

# Max size for an uploaded payslip .docx template.
_MAX_DOC_BYTES = 5 * 1024 * 1024

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


# ---------------------------------------------------------------------------
# Payslip template (Settings → Payslip)
# ---------------------------------------------------------------------------
def _payslip_out(company: Company) -> PayslipSettingsOut:
    settings = PayslipSettings.from_stored(company.payslip_settings)
    return PayslipSettingsOut(
        **settings.model_dump(),
        company_name=company.name,
        has_doc_template=company.payslip_doc_template is not None,
        doc_filename=company.payslip_doc_filename,
    )


@router.get("/payslip", response_model=PayslipSettingsOut)
async def get_payslip_settings(
    db: DBSessionDep,
    company_id: uuid.UUID = Depends(get_current_company_id),
    _: object = Depends(require_permission(Permission.PAYROLL_READ)),
) -> PayslipSettingsOut:
    """The company's payslip template (branding + section toggles)."""
    company = await _load_company(db, company_id)
    return _payslip_out(company)


@router.put("/payslip", response_model=PayslipSettingsOut)
async def update_payslip_settings(
    payload: PayslipSettingsUpdate,
    db: DBSessionDep,
    company_id: uuid.UUID = Depends(get_current_company_id),
    _: object = Depends(require_permission(Permission.USERS_MANAGE)),
) -> PayslipSettingsOut:
    """Edit the payslip template. Admin-only (users:manage). Partial update —
    only the fields present in the request are changed."""
    company = await _load_company(db, company_id)
    changes = payload.model_dump(exclude_unset=True)
    # Blank text fields -> None ("use the built-in default").
    for key in ("display_name", "logo_url", "accent_color", "footer_note"):
        if key in changes and isinstance(changes[key], str) and changes[key].strip() == "":
            changes[key] = None
    # Merge over the stored blob, then re-validate through the canonical model so
    # the persisted JSON always has a clean, fully-defaulted shape.
    merged = {**(company.payslip_settings or {}), **changes}
    company.payslip_settings = PayslipSettings(**merged).model_dump()
    try:
        await db.commit()
        await db.refresh(company)
    except Exception:
        await db.rollback()
        raise
    return _payslip_out(company)


_DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


@router.get("/payslip/document/sample")
async def download_sample_payslip_template(
    _: object = Depends(require_permission(Permission.PAYROLL_READ)),
) -> Response:
    """A ready-to-use .docx template with correct tokens already placed."""
    return Response(
        content=docx_service.sample_payslip_template(),
        media_type=_DOCX_MIME,
        headers={"Content-Disposition": 'attachment; filename="payslip-template-sample.docx"'},
    )


@router.put("/payslip/document", response_model=PayslipSettingsOut)
async def upload_payslip_document(
    db: DBSessionDep,
    file: UploadFile = File(...),
    company_id: uuid.UUID = Depends(get_current_company_id),
    _: object = Depends(require_permission(Permission.USERS_MANAGE)),
) -> PayslipSettingsOut:
    """Upload a .docx payslip template (Jinja/docxtpl tokens). Admin-only.

    Enable it via the ``use_doc_template`` flag (PUT /payslip) to have payslips
    generated from this document."""
    data = await file.read()
    if len(data) > _MAX_DOC_BYTES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Template too large (max 5 MB).",
        )
    if not docx_service.looks_like_docx(data):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Please upload a Word .docx document.",
        )
    company = await _load_company(db, company_id)
    company.payslip_doc_template = data
    company.payslip_doc_filename = (file.filename or "payslip-template.docx")[:255]
    try:
        await db.commit()
        await db.refresh(company)
    except Exception:
        await db.rollback()
        raise
    return _payslip_out(company)


@router.delete("/payslip/document", response_model=PayslipSettingsOut)
async def delete_payslip_document(
    db: DBSessionDep,
    company_id: uuid.UUID = Depends(get_current_company_id),
    _: object = Depends(require_permission(Permission.USERS_MANAGE)),
) -> PayslipSettingsOut:
    """Remove the uploaded payslip template and disable its use. Admin-only."""
    company = await _load_company(db, company_id)
    company.payslip_doc_template = None
    company.payslip_doc_filename = None
    # Don't leave the flag pointing at a now-missing template.
    merged = {**(company.payslip_settings or {}), "use_doc_template": False}
    company.payslip_settings = PayslipSettings(**merged).model_dump()
    try:
        await db.commit()
        await db.refresh(company)
    except Exception:
        await db.rollback()
        raise
    return _payslip_out(company)


# ---------------------------------------------------------------------------
# Statutory configuration (Settings → Statutory Compliance)
# ---------------------------------------------------------------------------
@router.get("/statutory", response_model=StatutoryConfig)
async def get_statutory_config(
    db: DBSessionDep,
    company_id: uuid.UUID = Depends(get_current_company_id),
    _: object = Depends(require_permission(Permission.PAYROLL_READ)),
) -> StatutoryConfig:
    """The company's statutory rates/thresholds (overrides + code defaults)."""
    company = await _load_company(db, company_id)
    return StatutoryConfig.from_stored(company.statutory_settings)


@router.put("/statutory", response_model=StatutoryConfig)
async def update_statutory_config(
    payload: StatutoryConfigUpdate,
    db: DBSessionDep,
    company_id: uuid.UUID = Depends(get_current_company_id),
    _: object = Depends(require_permission(Permission.USERS_MANAGE)),
) -> StatutoryConfig:
    """Edit statutory rates/thresholds. Admin-only (users:manage). Partial
    update; the result applies to every payroll run, payslip and live preview."""
    company = await _load_company(db, company_id)
    changes = payload.model_dump(exclude_unset=True)
    merged = {**(company.statutory_settings or {}), **changes}
    # Re-validate through the canonical model so the stored JSON is always clean.
    company.statutory_settings = StatutoryConfig(**merged).model_dump()
    try:
        await db.commit()
        await db.refresh(company)
    except Exception:
        await db.rollback()
        raise
    return StatutoryConfig.from_stored(company.statutory_settings)
