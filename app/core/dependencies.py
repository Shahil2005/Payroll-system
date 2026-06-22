import uuid
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession

from app.constants import Permission, permissions_for
from app.core.database import get_db, get_db_connect
from app.core.security import decode_access_token
from app.models.user import User

# For ORM queries
DBSessionDep = Annotated[AsyncSession, Depends(get_db)]

# For Raw SQL queries
DBConnectionDep = Annotated[AsyncConnection, Depends(get_db_connect)]

# Bearer token extractor. auto_error=False so we can raise our own 401 shape.
_bearer = HTTPBearer(auto_error=False)

_CREDENTIALS_EXC = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Not authenticated",
    headers={"WWW-Authenticate": "Bearer"},
)


async def get_current_user(
    db: DBSessionDep,
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User:
    """Resolve the signed-in user from the Bearer JWT.

    Raises 401 when the token is missing, malformed, expired, or points at a
    user that no longer exists / is inactive (spec §7).
    """
    if creds is None or not creds.credentials:
        raise _CREDENTIALS_EXC
    try:
        payload = decode_access_token(creds.credentials)
        user_id = uuid.UUID(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise _CREDENTIALS_EXC

    user = (
        await db.execute(select(User).where(User.id == user_id))
    ).scalar_one_or_none()
    if user is None or not user.is_active or user.deleted_at is not None:
        raise _CREDENTIALS_EXC
    return user


CurrentUserDep = Annotated[User, Depends(get_current_user)]


def get_current_company_id(current_user: CurrentUserDep) -> uuid.UUID:
    """Company scoping for multi-tenancy — derived from the signed-in user.

    Every query filters by this id, so users only ever see their own tenant's
    data. (Replaces the earlier single-company stub now that auth is wired.)
    """
    return current_user.company_id


def require_permission(permission: Permission):
    """Dependency factory enforcing a `payroll:*` permission (PermissionChecker).

    Returns the current user when authorized; raises 403 otherwise.
    """

    async def checker(current_user: CurrentUserDep) -> User:
        if permission not in permissions_for(current_user.role):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing required permission: {permission.value}",
            )
        return current_user

    return checker


async def get_current_employee_id(
    current_user: Annotated[User, Depends(require_permission(Permission.SELF_READ))],
) -> uuid.UUID:
    """Resolve the linked Employee id for a self-service (EMPLOYEE) user.

    Gates the /api/v1/me/* endpoints: the caller must hold SELF_READ *and* be
    linked to an Employee. A SELF_READ user with no link is a misconfiguration
    (409) — there is nothing to scope to. Every self-endpoint filters by the
    returned id, so a user can only ever read their own records.
    """
    if current_user.employee_id is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This account is not linked to an employee record.",
        )
    return current_user.employee_id
