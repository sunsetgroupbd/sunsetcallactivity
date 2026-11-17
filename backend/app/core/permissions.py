"""
Dependency-injection helpers for authentication and role-based access control.
"""
from __future__ import annotations

from typing import Optional

from fastapi import Cookie, Depends, Header, HTTPException, status
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_token
from app.db.session import get_db
from app.models.user import User, UserRole
from app.repositories.user_repo import UserRepository


async def _get_current_user(
    authorization: Optional[str] = Header(default=None),
    access_token_cookie: Optional[str] = Cookie(default=None, alias="access_token"),
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    Extract and verify the access token from either:
      - ``Authorization: Bearer <token>`` header, or
      - ``access_token`` HttpOnly cookie.
    Returns the authenticated User or raises 401.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    token: Optional[str] = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1]
    elif access_token_cookie:
        token = access_token_cookie

    if not token:
        raise credentials_exception

    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise credentials_exception
        user_id: Optional[str] = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    repo = UserRepository(db)
    user = await repo.get_by_id(int(user_id))
    if user is None or not user.is_active:
        raise credentials_exception
    return user


# ─── Public dependency aliases ────────────────────────────────────────────────

CurrentUser = Depends(_get_current_user)


async def get_current_user(
    user: User = Depends(_get_current_user),
) -> User:
    return user


async def require_admin(
    user: User = Depends(_get_current_user),
) -> User:
    """Raise 403 if the current user is not an admin or sub-admin."""
    if user.role not in (UserRole.ADMIN, UserRole.SUB_ADMIN):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin or Sub-admin access required",
        )
    return user


async def require_only_admin(
    user: User = Depends(_get_current_user),
) -> User:
    """Raise 403 if the current user is not strictly ADMIN (excludes SUB_ADMIN)."""
    if user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Strict Admin access required. Sub-admins and other roles cannot access this service.",
        )
    return user


def require_report_access(report_employee_id: int, current_user: User) -> None:
    """
    Raise 403 if current_user is not an admin/sub-admin/TL and does not own the report.
    Call this helper inside endpoint handlers after loading the report.
    """
    if current_user.role in (UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.TL):
        return
    if current_user.id != report_employee_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this report",
        )
