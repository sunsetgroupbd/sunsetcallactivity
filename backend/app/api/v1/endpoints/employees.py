"""Employees (user management) endpoints — admin write, self read."""
from __future__ import annotations

import csv
import io
import re
from typing import Optional, Any

from fastapi import APIRouter, Depends, Query, UploadFile, File, Form, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import get_current_user, require_admin
from app.core.security import hash_password
from app.db.session import get_db
from app.models.user import User, UserRole
from app.repositories.user_repo import UserRepository
from app.schemas.user import UserCreate, UserRead, UserUpdate

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
        designation=data.designation,
        password_hash=hash_password(data.password),
        role=data.role,
        is_active=data.is_active,
    )
    return await repo.create(user)


@router.post("/bulk-upload")
async def bulk_upload_employees(
    file: UploadFile = File(...),
    default_password: str = Form("Sunset@1234"),
    reset_existing_passwords: bool = Form(False),
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Bulk register or update employees from a CSV file.

    Existing employees retain their existing passwords unless
    reset_existing_passwords is explicitly True.
    """
    if not file.filename or not file.filename.lower().endswith((".csv", ".txt")):
        raise HTTPException(status_code=400, detail="Uploaded file must be a CSV file (.csv)")

    raw_bytes = await file.read()
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="Uploaded CSV file is empty")

    try:
        text_content = raw_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        text_content = raw_bytes.decode("latin-1", errors="replace")

    reader = csv.reader(io.StringIO(text_content))
    rows = list(reader)
    if not rows or len(rows) < 2:
        raise HTTPException(status_code=400, detail="CSV contains no employee data rows")

    # Header detection
    headers = [h.strip() for h in rows[0]]
    norm_headers = [re.sub(r"[^a-z0-9]", "", h.lower()) for h in headers]

    def find_col_idx(*patterns: str) -> Optional[int]:
        for p in patterns:
            cleaned_p = re.sub(r"[^a-z0-9]", "", p.lower())
            for idx, h in enumerate(norm_headers):
                if cleaned_p in h or h in cleaned_p:
                    return idx
        return None

    id_idx = find_col_idx("employee id", "employeeid", "empid", "id")
    name_idx = find_col_idx("name", "fullname", "full name", "employee name")
    username_idx = find_col_idx("username", "user name")
    email_idx = find_col_idx("email", "emailaddress")
    phone_idx = find_col_idx("phone number", "phone", "phonenumber", "mobile")
    desig_idx = find_col_idx("designation", "position", "title")

    if name_idx is None or email_idx is None:
        raise HTTPException(
            status_code=400,
            detail="CSV must contain at least 'Name' and 'Email' columns."
        )

    clean_default_password = default_password.strip() if default_password else "Sunset@1234"
    if len(clean_default_password) < 8:
        clean_default_password = "Sunset@1234"
    hashed_default = hash_password(clean_default_password)

    repo = UserRepository(db)
    created_count = 0
    updated_count = 0
    skipped_count = 0
    errors: list[str] = []

    for row_num, row in enumerate(rows[1:], start=2):
        if not row or all(not str(cell).strip() for cell in row):
            continue

        def get_val(idx: Optional[int]) -> str:
            if idx is not None and idx < len(row):
                return str(row[idx]).strip()
            return ""

        raw_id = get_val(id_idx)
        name = get_val(name_idx)
        username = get_val(username_idx)
        email = get_val(email_idx).lower()
        phone = get_val(phone_idx)
        designation = get_val(desig_idx)

        if not name:
            errors.append(f"Row {row_num}: Missing employee name, skipped.")
            skipped_count += 1
            continue

        if not email or "@" not in email:
            errors.append(f"Row {row_num}: Invalid or missing email '{email}', skipped.")
            skipped_count += 1
            continue

        emp_id: Optional[int] = None
        if raw_id:
            try:
                emp_id = int(raw_id)
            except ValueError:
                emp_id = None

        if not username:
            username = email.split("@")[0].strip()

        # Check existing user
        existing_user: Optional[User] = None
        if emp_id is not None:
            existing_user = await repo.get_by_id(emp_id)
        if not existing_user and username:
            existing_user = await repo.get_by_username(username)
        if not existing_user and email:
            existing_user = await repo.get_by_email(email)

        if existing_user:
            # UPDATE existing user
            existing_user.full_name = name
            if phone:
                existing_user.phone = phone
            if designation:
                existing_user.designation = designation

            # Only update email if not in conflict
            if existing_user.email != email:
                user_with_email = await repo.get_by_email(email)
                if not user_with_email or user_with_email.id == existing_user.id:
                    existing_user.email = email
                else:
                    errors.append(f"Row {row_num}: Email '{email}' in use by another user; kept existing email.")

            if reset_existing_passwords:
                existing_user.password_hash = hashed_default

            await repo.update(existing_user)
            updated_count += 1
        else:
            # CREATE new user
            if await repo.get_by_email(email):
                errors.append(f"Row {row_num}: Email '{email}' already registered, skipped.")
                skipped_count += 1
                continue

            if await repo.get_by_username(username):
                username = f"{username}{emp_id}" if emp_id else f"{username}_{row_num}"

            new_user = User(
                id=emp_id,
                full_name=name,
                email=email,
                phone=phone or None,
                username=username,
                designation=designation or None,
                password_hash=hashed_default,
                role=UserRole.EMPLOYEE,
                is_active=True,
            )
            try:
                await repo.create(new_user)
                created_count += 1
            except Exception as exc:
                errors.append(f"Row {row_num}: Could not create user {name} ({exc})")
                skipped_count += 1

    return {
        "total_rows": len(rows) - 1,
        "created_count": created_count,
        "updated_count": updated_count,
        "skipped_count": skipped_count,
        "errors": errors[:50],
        "message": f"Successfully processed {len(rows) - 1} records: {created_count} created, {updated_count} updated, {skipped_count} skipped.",
    }


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
