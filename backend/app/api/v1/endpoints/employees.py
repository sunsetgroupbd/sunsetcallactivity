"""Employees (user management) endpoints — admin write, self read."""
from __future__ import annotations

import csv
import io
import re
from typing import Optional, Any

from fastapi import APIRouter, Depends, Query, UploadFile, File, Form, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import get_current_user, require_admin
from app.core.security import hash_password
from app.db.session import get_db
from app.models.team import Team
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
    limit: int = Query(500, ge=1, le=2000),
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
    user_kwargs: dict[str, Any] = {
        "full_name": data.full_name,
        "email": data.email,
        "phone": data.phone,
        "username": data.username,
        "designation": data.designation,
        "password_hash": hash_password(data.password),
        "role": data.role,
        "is_active": data.is_active,
        "team_id": data.team_id,
        "reporting_manager_id": data.reporting_manager_id,
        "client_count": data.client_count or 0,
        "client_share_count": data.client_share_count or 0,
    }
    if data.id is not None:
        user_kwargs["id"] = data.id
    user = User(**user_kwargs)
    return await repo.create(user)


def _get_val(row: list[str], idx: Optional[int]) -> str:
    if idx is not None and idx < len(row):
        return row[idx].strip()
    return ""


@router.post("/bulk-upload")
async def bulk_upload_employees(
    file: UploadFile = File(...),
    default_password: str = Form("Sunset@1234"),
    role: str = Form("employee"),
    target_team_id: Optional[int] = Form(None),
    target_manager_id: Optional[int] = Form(None),
    reset_existing_passwords: bool = Form(False),
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Bulk register or update employees from a CSV file.

    Supports role-wise, team-wise, and supervisor-wise column detection or batch preset.
    Existing employees retain their existing passwords unless reset_existing_passwords is True.
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
                if cleaned_p == h or cleaned_p in h:
                    return idx
        return None

    id_idx = find_col_idx("employee id", "employeeid", "empid", "id")
    name_idx = find_col_idx("name", "fullname", "full name", "employee name")
    username_idx = find_col_idx("username", "user name")
    email_idx = find_col_idx("email", "emailaddress")
    phone_idx = find_col_idx("phone number", "phone", "phonenumber", "mobile")
    desig_idx = find_col_idx("designation", "position", "title")
    role_idx = find_col_idx("role", "user role", "userrole")
    team_idx = find_col_idx("team", "gl team", "glteam", "team name")
    manager_idx = find_col_idx(
        "supervisor", "reporting manager", "reports to", "manager", "tl", "co", "coordinator", "team leader"
    )

    if name_idx is None or email_idx is None:
        raise HTTPException(
            status_code=400,
            detail="CSV must contain at least 'Name' and 'Email' columns."
        )

    clean_default_password = default_password.strip() if default_password else "Sunset@1234"
    if len(clean_default_password) < 8:
        clean_default_password = "Sunset@1234"
    hashed_default = hash_password(clean_default_password)

    # Preload teams for matching
    all_teams_res = await db.execute(select(Team))
    all_teams = list(all_teams_res.scalars().all())
    team_lookup: dict[str, int] = {}
    for t in all_teams:
        team_lookup[str(t.id)] = t.id
        team_lookup[re.sub(r"[^a-z0-9]", "", t.name.lower())] = t.id
        if t.director_name:
            team_lookup[re.sub(r"[^a-z0-9]", "", t.director_name.lower())] = t.id

    # Preload users for supervisor matching
    all_users_res = await db.execute(select(User))
    all_users = list(all_users_res.scalars().all())
    user_lookup: dict[str, int] = {}
    for u in all_users:
        user_lookup[str(u.id)] = u.id
        user_lookup[re.sub(r"[^a-z0-9]", "", u.username.lower())] = u.id
        user_lookup[u.email.lower()] = u.id
        user_lookup[re.sub(r"[^a-z0-9]", "", u.full_name.lower())] = u.id

    repo = UserRepository(db)
    created_count = 0
    updated_count = 0
    skipped_count = 0
    errors: list[str] = []

    for row_num, row in enumerate(rows[1:], start=2):
        if not row or all(not cell.strip() for cell in row):
            continue

        raw_id = _get_val(row, id_idx)
        name = _get_val(row, name_idx)
        username = _get_val(row, username_idx)
        email = _get_val(row, email_idx).lower()
        phone = _get_val(row, phone_idx)
        designation = _get_val(row, desig_idx)
        raw_role = _get_val(row, role_idx)
        raw_team = _get_val(row, team_idx)
        raw_manager = _get_val(row, manager_idx)

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

        # Resolve role to assign
        assigned_role = UserRole.EMPLOYEE
        if raw_role:
            cleaned_role = re.sub(r"[^a-z0-9]", "", raw_role.lower())
            if cleaned_role in ("co", "coordinator", "coordinatorco"):
                assigned_role = UserRole.CO
            elif cleaned_role in ("tl", "teamleader", "teamlead", "leader"):
                assigned_role = UserRole.TL
            elif cleaned_role in ("subadmin", "sub_admin"):
                assigned_role = UserRole.SUB_ADMIN
            elif cleaned_role in ("admin", "administrator"):
                assigned_role = UserRole.ADMIN
            elif cleaned_role in ("employee", "executive", "salesexecutive", "sales"):
                assigned_role = UserRole.EMPLOYEE
        elif role == "auto":
            desig_lower = designation.lower()
            if "team leader" in desig_lower or "team lead" in desig_lower:
                assigned_role = UserRole.TL
            elif "coordinator" in desig_lower or "co-ordinator" in desig_lower:
                assigned_role = UserRole.CO
            elif "sub admin" in desig_lower:
                assigned_role = UserRole.SUB_ADMIN
            elif "admin" in desig_lower or "director" in desig_lower:
                assigned_role = UserRole.ADMIN
            else:
                assigned_role = UserRole.EMPLOYEE
        elif role in ("tl", "co", "sub_admin", "admin", "employee"):
            assigned_role = UserRole(role)

        # Resolve team_id
        row_team_id: Optional[int] = target_team_id
        if raw_team:
            cleaned_team = re.sub(r"[^a-z0-9]", "", raw_team.lower())
            if cleaned_team in team_lookup:
                row_team_id = team_lookup[cleaned_team]
            elif "gazi" in cleaned_team:
                for k, v in team_lookup.items():
                    if "gazi" in k:
                        row_team_id = v
                        break
            elif "hasib" in cleaned_team:
                for k, v in team_lookup.items():
                    if "hasib" in k:
                        row_team_id = v
                        break

        # Resolve reporting_manager_id
        row_manager_id: Optional[int] = target_manager_id
        if raw_manager:
            cleaned_mgr = re.sub(r"[^a-z0-9]", "", raw_manager.lower())
            if cleaned_mgr in user_lookup:
                row_manager_id = user_lookup[cleaned_mgr]
            elif raw_manager.lower() in user_lookup:
                row_manager_id = user_lookup[raw_manager.lower()]

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

            # Update role, team, supervisor
            existing_user.role = assigned_role
            if row_team_id is not None:
                existing_user.team_id = row_team_id
            if row_manager_id is not None:
                existing_user.reporting_manager_id = row_manager_id

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

            new_user_kwargs: dict[str, Any] = {
                "full_name": name,
                "email": email,
                "phone": phone or None,
                "username": username,
                "designation": designation or None,
                "password_hash": hashed_default,
                "role": assigned_role,
                "is_active": True,
                "team_id": row_team_id,
                "reporting_manager_id": row_manager_id,
            }
            if emp_id is not None:
                new_user_kwargs["id"] = emp_id
            new_user = User(**new_user_kwargs)
            try:
                await repo.create(new_user)
                created_count += 1
                # register in lookup so subsequent rows can reference this user as manager
                if new_user.id:
                    user_lookup[str(new_user.id)] = new_user.id
                    user_lookup[re.sub(r"[^a-z0-9]", "", new_user.username.lower())] = new_user.id
                    user_lookup[new_user.email.lower()] = new_user.id
                    user_lookup[re.sub(r"[^a-z0-9]", "", new_user.full_name.lower())] = new_user.id
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
