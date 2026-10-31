"""Settings and targets endpoints."""
from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import get_current_user, require_admin
from app.db.session import get_db
from app.models.user import User
from app.repositories.settings_repo import SettingsRepository
from app.repositories.targets_repo import TargetsRepository
from app.schemas.targets import TargetsCreate, TargetsRead, TargetsUpdate
from app.schemas.settings import AllSettings, NamespaceSettings, SettingRead, SettingUpsert
from fastapi import HTTPException

router = APIRouter(tags=["Settings & Targets"])

# ─── App Settings ─────────────────────────────────────────────────────────────


@router.get("/settings", response_model=AllSettings)
async def get_all_settings(
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = SettingsRepository(db)
    all_settings = await repo.get_all()
    namespaces: dict = {}
    for s in all_settings:
        namespaces.setdefault(s.namespace, {})[s.key] = s.value
    return AllSettings(namespaces=namespaces)


@router.get("/settings/system", response_model=list[SettingRead])
async def get_system_settings(
    namespace: Optional[str] = Query(None),
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = SettingsRepository(db)
    if namespace:
        items = await repo.get_namespace(namespace)
    else:
        items = await repo.get_all()
    return list(items)


@router.get("/settings/{namespace}", response_model=NamespaceSettings)
async def get_namespace_settings(
    namespace: str,
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = SettingsRepository(db)
    items = await repo.get_namespace(namespace)
    return NamespaceSettings(namespace=namespace, settings={s.key: s.value for s in items})


@router.put("/settings", response_model=SettingRead)
@router.put("/settings/system", response_model=SettingRead)
async def upsert_setting(
    data: SettingUpsert,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    repo = SettingsRepository(db)
    setting = await repo.upsert(data.namespace, data.key, data.value, data.description)
    return setting


@router.delete("/settings/{namespace}/{key}", status_code=204)
async def delete_setting(
    namespace: str,
    key: str,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    repo = SettingsRepository(db)
    deleted = await repo.delete(namespace, key)
    if not deleted:
        raise HTTPException(status_code=404, detail="Setting not found")


# ─── Targets ──────────────────────────────────────────────────────────────────


@router.get("/targets", response_model=list[TargetsRead])
async def list_targets(
    employee_id: Optional[int] = Query(None),
    global_only: bool = Query(False),
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = TargetsRepository(db)
    return list(await repo.list_targets(employee_id=employee_id, global_only=global_only))


@router.post("/targets", response_model=TargetsRead, status_code=201)
async def create_targets(
    data: TargetsCreate,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    from app.models.targets import DailyTargets
    repo = TargetsRepository(db)
    target = DailyTargets(**data.model_dump())
    return await repo.create(target)


@router.put("/targets/{target_id}", response_model=TargetsRead)
async def update_targets(
    target_id: int,
    data: TargetsUpdate,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    repo = TargetsRepository(db)
    target = await repo.get_by_id(target_id)
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(target, field, value)
    return await repo.update(target)


@router.delete("/targets/{target_id}", status_code=204)
async def delete_targets(
    target_id: int,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    repo = TargetsRepository(db)
    target = await repo.get_by_id(target_id)
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")
    await repo.delete(target)
