import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from app.constants import Permission, Role, permissions_for
from app.core.dependencies import CurrentUserDep, DBSessionDep, get_current_company_id, require_permission
from app.core.security import create_access_token, hash_password, verify_password
from app.models.company import Company
from app.models.employee import Employee
from app.models.user import User
from app.services import leave_service
from app.schema.auth import LoginRequest, SignupRequest, TokenResponse, UserCreate, UserOut

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


def _to_out(user: User) -> UserOut:
    out = UserOut.model_validate(user)
    out.permissions = sorted(p.value for p in permissions_for(user.role))
    return out


async def _email_taken(db: DBSessionDep, email: str) -> bool:
    """True if an active user already owns this email. Login resolves users by
    email alone (not scoped to a company), so emails must be globally unique."""
    row = (
        await db.execute(
            select(User.id).where(User.email == email, User.deleted_at.is_(None))
        )
    ).first()
    return row is not None


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, db: DBSessionDep) -> TokenResponse:
    user = (
        await db.execute(select(User).where(User.email == payload.email))
    ).scalar_one_or_none()
    # Constant-ish failure: same error whether the email or password is wrong.
    if (
        user is None
        or not user.is_active
        or user.deleted_at is not None
        or not verify_password(payload.password, user.hashed_password)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    token = create_access_token(
        user_id=user.id, company_id=user.company_id, role=user.role
    )
    return TokenResponse(access_token=token, user=_to_out(user))


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def signup(payload: SignupRequest, db: DBSessionDep) -> TokenResponse:
    """Public self-service registration. Creates a new organization (company)
    and its first user as ADMIN, then returns a token so the UI can sign them
    straight in. Adding further users to the org is done by that ADMIN via
    POST /users."""
    if await _email_taken(db, payload.email):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )
    company = Company(name=payload.company_name)
    db.add(company)
    await db.flush()  # populate company.id (server-side uuid) for the FK below
    user = User(
        company_id=company.id,
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
        role=Role.ADMIN.value,
        is_active=True,
    )
    db.add(user)
    company_id = company.id  # capture before commit expires the instance
    try:
        await db.commit()
        await db.refresh(user)
    except Exception:
        await db.rollback()
        raise
    # Build the token + response now, while `user` is fresh — the seeding below
    # commits and would expire the instance (a later attr read → MissingGreenlet).
    token = create_access_token(
        user_id=user.id, company_id=user.company_id, role=user.role
    )
    response = TokenResponse(access_token=token, user=_to_out(user))
    # Pre-populate the standard leave types so a new org isn't stuck with an
    # empty leave-type list (mirrors how Zoho/Keka ship defaults out of the box).
    await leave_service.seed_default_types(db, company_id)
    return response


@router.get("/me", response_model=UserOut)
async def me(current_user: CurrentUserDep) -> UserOut:
    """Return the signed-in user (used by the frontend to restore a session)."""
    return _to_out(current_user)


@router.post("/logout")
async def logout(current_user: CurrentUserDep) -> dict[str, str]:
    """Stateless JWT logout — the client discards the token. Endpoint exists so
    the UI has something to call and so we can hook revocation later."""
    return {"message": "Logged out"}


# --- User administration (ADMIN only) --------------------------------------
@router.get("/users", response_model=list[UserOut])
async def list_users(
    db: DBSessionDep,
    company_id: uuid.UUID = Depends(get_current_company_id),
    _: User = Depends(require_permission(Permission.USERS_MANAGE)),
) -> list[UserOut]:
    rows = (
        await db.execute(
            select(User)
            .where(User.company_id == company_id, User.deleted_at.is_(None))
            .order_by(User.created_at)
        )
    ).scalars().all()
    return [_to_out(u) for u in rows]


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: UserCreate,
    db: DBSessionDep,
    company_id: uuid.UUID = Depends(get_current_company_id),
    _: User = Depends(require_permission(Permission.USERS_MANAGE)),
) -> UserOut:
    if await _email_taken(db, payload.email):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists.",
        )

    # Self-service users must be tied to an Employee in this company; non-employee
    # roles must not be (the link is what scopes /me/* to one person's records).
    if payload.role is Role.EMPLOYEE and payload.employee_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="An EMPLOYEE user must be linked to an employee_id.",
        )
    if payload.employee_id is not None:
        if payload.role is not Role.EMPLOYEE:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="employee_id may only be set for the EMPLOYEE role.",
            )
        owned = (
            await db.execute(
                select(Employee.id).where(
                    Employee.id == payload.employee_id,
                    Employee.company_id == company_id,
                    Employee.deleted_at.is_(None),
                )
            )
        ).first()
        if owned is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Employee not found in this company.",
            )
        already = (
            await db.execute(
                select(User.id).where(
                    User.employee_id == payload.employee_id,
                    User.deleted_at.is_(None),
                )
            )
        ).first()
        if already is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This employee already has a linked login.",
            )

    user = User(
        company_id=company_id,
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
        role=payload.role.value,
        is_active=True,
        employee_id=payload.employee_id,
    )
    db.add(user)
    try:
        await db.commit()
        await db.refresh(user)
    except Exception:
        await db.rollback()
        raise
    return _to_out(user)
