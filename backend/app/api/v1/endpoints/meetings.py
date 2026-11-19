"""Meeting activity endpoints."""
from __future__ import annotations

from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.meeting_activity import MeetingEntriesRead, MeetingEntriesUpsert
from app.schemas.outdoor_visit import (
    FairReturnPayload,
    FairStartPayload,
    OutdoorVisitCreate,
    OutdoorVisitRead,
)
from app.services.meeting_service import MeetingService
from app.services.outdoor_visit_service import OutdoorVisitService

router = APIRouter(tags=["Meeting Activity"])


@router.get("/reports/{report_id}/meetings", response_model=MeetingEntriesRead)
async def get_meeting_entries(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = MeetingService(db)
    entries = await svc.get_entries(report_id, current_user)
    return MeetingEntriesRead(report_id=report_id, entries=list(entries))


@router.put("/reports/{report_id}/meetings", response_model=MeetingEntriesRead)
async def upsert_meeting_entries(
    report_id: int,
    data: MeetingEntriesUpsert,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = MeetingService(db)
    entries = await svc.upsert_entries(report_id, data, current_user)
    return MeetingEntriesRead(report_id=report_id, entries=list(entries))


# ── Outdoor & Fair Visit Endpoints ──────────────────────────────────────────


@router.get("/outdoor-logs", response_model=List[OutdoorVisitRead])
async def get_outdoor_logs(
    visit_date: date = Query(..., description="Target date in YYYY-MM-DD"),
    employee_id: Optional[int] = Query(None, description="Employee ID filter (Admin/Supervisor only)"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve outdoor and fair visit logs for a specific date."""
    svc = OutdoorVisitService(db)
    return await svc.get_logs(visit_date, employee_id, current_user)


@router.get("/fair/active", response_model=Optional[OutdoorVisitRead])
async def get_active_fair(
    visit_date: date = Query(..., description="Target date in YYYY-MM-DD"),
    employee_id: Optional[int] = Query(None, description="Employee ID filter (Admin/Supervisor only)"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Check if employee is currently active on Fair Duty."""
    svc = OutdoorVisitService(db)
    return await svc.get_active_fair(visit_date, employee_id, current_user)


@router.post("/fair/start", response_model=OutdoorVisitRead)
async def start_fair_visit(
    payload: FairStartPayload,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Record departure to a Real Estate Fair or Stall."""
    svc = OutdoorVisitService(db)
    return await svc.start_fair(payload, current_user)


@router.post("/fair/return", response_model=OutdoorVisitRead)
async def return_fair_visit(
    payload: FairReturnPayload,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Record return from Fair, calculate duration, and mark Present."""
    svc = OutdoorVisitService(db)
    return await svc.return_fair(payload, current_user)


@router.post("/outdoor-logs", response_model=OutdoorVisitRead)
async def create_outdoor_log(
    payload: OutdoorVisitCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create manual outdoor visit (Client/Site visit or Fair visit)."""
    svc = OutdoorVisitService(db)
    return await svc.create_log(payload, current_user)


@router.delete("/outdoor-logs/{log_id}")
async def delete_outdoor_log(
    log_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete an outdoor or fair visit log."""
    svc = OutdoorVisitService(db)
    success = await svc.delete_log(log_id, current_user)
    return {"success": success}
