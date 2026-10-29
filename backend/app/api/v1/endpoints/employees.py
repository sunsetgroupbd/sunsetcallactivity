"""Employees (user management) endpoints — admin write, self read."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import get_current_user, require_admin
from app.core.security import hash_password
from app.db.session import get_db
from app.models.user import User, UserRole
from app.repositories.user_repo import UserRepository
from app.schemas.user import UserCreate, UserRead, UserUpdate
from fastapi import HTTPException

router = APIRouter(prefix="/employees", tags=["Employees"])


@router.get("", response_model=list[UserRead])
async def list_employees(
    role: Optional[UserRole] = Query(None),
    is_active: Optional[bool] = Query(None),
    search: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    repo = UserRepository(db)
    return list(
        await repo.list_all(
            role=role,
            is_active=is_active,
            search=search,
            skip=skip,
            limit=limit,
        )
    )


@router.post("", response_model=UserRead, status_code=201)
async def create_employee(
    data: UserCreate,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    repo = UserRepository(db)
    if data.id is not None:
        existing_id = await repo.get_by_id(data.id)
        if existing_id:
            raise HTTPException(
                status_code=409,
                detail=f"Employee ID {data.id} is already in use by {existing_id.full_name} (@{existing_id.username})"
            )
    if await repo.get_by_email(data.email):
        raise HTTPException(status_code=409, detail="Email already registered")
    if await repo.get_by_username(data.username):
        raise HTTPException(status_code=409, detail="Username already taken")
    user = User(
        id=data.id,
        full_name=data.full_name,
        email=data.email,
        phone=data.phone,
        username=data.username,
        password_hash=hash_password(data.password),
        role=data.role,
        is_active=data.is_active,
    )
    return await repo.create(user)


@router.get("/{user_id}", response_model=UserRead)
async def get_employee(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Admins and sub-admins can read any; employees can only read themselves
    if current_user.role not in (UserRole.ADMIN, UserRole.SUB_ADMIN) and current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    repo = UserRepository(db)
    user = await repo.get_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.put("/{user_id}", response_model=UserRead)
async def update_employee(
    user_id: int,
    data: UserUpdate,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    repo = UserRepository(db)
    user = await repo.get_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if current_admin.role == UserRole.SUB_ADMIN and user.role == UserRole.ADMIN and current_admin.id != user.id:
        raise HTTPException(status_code=403, detail="Sub-admin cannot modify an administrator account")
    update_data = data.model_dump(exclude_unset=True)

    # Check if custom Employee ID is changing
    new_id = update_data.pop("id", None)
    if new_id is not None and new_id != user_id:
        existing = await repo.get_by_id(new_id)
        if existing and existing.id != user_id:
            raise HTTPException(
                status_code=409,
                detail=f"Employee ID {new_id} is already in use by {existing.full_name} (@{existing.username})"
            )
        try:
            user = await repo.change_employee_id(user_id, new_id)
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc))

    if "password" in update_data:
        update_data["password_hash"] = hash_password(update_data.pop("password"))
    for field, value in update_data.items():
        setattr(user, field, value)
    return await repo.update(user)


@router.delete("/{user_id}", status_code=204)
async def delete_employee(
    user_id: int,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    if current_admin.id == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    repo = UserRepository(db)
    user = await repo.get_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if current_admin.role == UserRole.SUB_ADMIN and user.role == UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Sub-admin cannot delete an administrator account")
    await repo.delete(user)
