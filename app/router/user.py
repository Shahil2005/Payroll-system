from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from app.core.dependencies import DBSessionDep
from app.models.user import User
from app.schema.user import UserCreate, UserResponse

router = APIRouter(prefix="/api/v1/employees", tags=["employees"])


@router.post(
    "",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_employee(
    payload: UserCreate,
    db: DBSessionDep,
) -> User:
    """Create a new employee user in the system."""
    # Check for existing email or username
    stmt_check = select(User).where(
        (User.username == payload.username) | (User.email == payload.email)
    )
    res_check = await db.execute(stmt_check)
    existing = res_check.scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Employee with this username or email already exists.",
        )

    # Generate simple slug
    slug = payload.username.lower().replace(" ", "-").replace("_", "-")

    new_user = User(
        username=payload.username,
        slug=slug,
        email=payload.email,
        first_name=payload.first_name,
        last_name=payload.last_name,
        password=payload.password,  # In production, hash the password. Storing as plain text for boilerplate consistency.
    )

    db.add(new_user)
    try:
        await db.commit()
        await db.refresh(new_user)
    except Exception:
        await db.rollback()
        raise

    return new_user


@router.get("", response_model=list[UserResponse])
async def get_employees(
    db: DBSessionDep,
) -> list[User]:
    """Retrieve list of all registered employee users."""
    stmt = select(User).order_by(User.id)
    res = await db.execute(stmt)
    return list(res.scalars().all())
