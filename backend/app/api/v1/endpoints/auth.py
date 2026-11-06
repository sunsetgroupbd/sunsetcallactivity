"""
Authentication endpoints.

Token strategy:
  - Access token: short-lived JWT returned in JSON body (used in Authorization header)
  - Refresh token: long-lived JWT stored in HttpOnly secure cookie
  - Never store refresh tokens in localStorage

Cookie / CORS / CSRF notes:
  - COOKIE_SECURE should be True in production (HTTPS required)
  - COOKIE_SAMESITE=lax protects against CSRF for most use-cases;
    use "strict" for extra hardening or "none" + secure for cross-site setups
  - Frontend must send credentials: "include" on fetch for cookie-based refresh
"""
from __future__ import annotations

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.permissions import get_current_user
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    verify_password,
)
from app.db.session import get_db
from app.repositories.user_repo import UserRepository
from app.schemas.auth import MessageResponse, TokenResponse
from app.schemas.user import UserRead

router = APIRouter(prefix="/auth", tags=["Authentication"])

_REFRESH_COOKIE = "refresh_token"
_ACCESS_EXPIRE_SECONDS = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60


@router.post("/login", response_model=TokenResponse)
async def login(
    response: Response,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Authenticate with username/email and password.
    Supports both JSON body ({"username": "...", "password": "..."})
    and standard OAuth2 x-www-form-urlencoded form data.
    """
    username: str = ""
    password: str = ""

    content_type = request.headers.get("content-type", "").lower()
    if "application/json" in content_type:
        try:
            body = await request.json()
            username = str(body.get("username", "")).strip()
            password = str(body.get("password", ""))
        except Exception:
            pass
    else:
        try:
            form = await request.form()
            username = str(form.get("username", "")).strip()
            password = str(form.get("password", ""))
        except Exception:
            pass

    if not username or not password:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Username and password are required",
        )

    repo = UserRepository(db)
    user = await repo.get_by_username_or_email(username)
    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username, employee ID, or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(status_code=400, detail="User account is disabled")

    access_token = create_access_token(
        subject=user.id, extra={"role": user.role.value, "username": user.username}
    )
    refresh_token = create_refresh_token(subject=user.id)

    # Set refresh token as HttpOnly cookie
    response.set_cookie(
        key=_REFRESH_COOKIE,
        value=refresh_token,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/api/v1/auth",
    )

    return TokenResponse(access_token=access_token, expires_in=_ACCESS_EXPIRE_SECONDS)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    response: Response,
    refresh_token: str | None = Cookie(default=None, alias=_REFRESH_COOKIE),
    db: AsyncSession = Depends(get_db),
):
    """
    Issue a new access token using the HttpOnly refresh-token cookie.
    The refresh token is rotated on each use.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired refresh token",
    )
    if not refresh_token:
        raise credentials_exception
    try:
        payload = decode_token(refresh_token)
        if payload.get("type") != "refresh":
            raise credentials_exception
        user_id = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        raise credentials_exception

    repo = UserRepository(db)
    user = await repo.get_by_id(user_id)
    if not user or not user.is_active:
        raise credentials_exception

    new_access = create_access_token(
        subject=user.id, extra={"role": user.role.value, "username": user.username}
    )
    new_refresh = create_refresh_token(subject=user.id)

    response.set_cookie(
        key=_REFRESH_COOKIE,
        value=new_refresh,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/api/v1/auth",
    )

    return TokenResponse(access_token=new_access, expires_in=_ACCESS_EXPIRE_SECONDS)


@router.post("/logout", response_model=MessageResponse)
async def logout(response: Response):
    """Clear the refresh-token cookie."""
    response.delete_cookie(key=_REFRESH_COOKIE, path="/api/v1/auth")
    return MessageResponse(message="Logged out successfully")


@router.get("/me", response_model=UserRead)
async def me(current_user=Depends(get_current_user)):
    """Return the currently authenticated user's profile."""
    return current_user
