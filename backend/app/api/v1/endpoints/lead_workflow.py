"""Endpoints for the Lead-wise Calling Workflow."""
from __future__ import annotations

from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.lead import (
    LeadCallLogRead,
    LeadCallOutcome,
    LeadCreate,
    LeadRead,
    LeadSummaryResponse,
    LeadUpdate,
)
from app.services.lead_service import LeadService

router = APIRouter(tags=["Lead Workflow"])


@router.get("/summary", response_model=LeadSummaryResponse)
async def get_lead_summary(
    employee_id: Optional[int] = Query(None, description="Filter by employee (Admin only)"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = LeadService(db)
    return await svc.get_summary(current_user, filter_employee_id=employee_id)


@router.get("", response_model=dict)
async def list_leads(
    source: Optional[str] = Query(None, description="fb_lead, fair_lead, cold_lead, reference, or all"),
    status: Optional[str] = Query(None, description="hp, p, fup, ni, nr, or all"),
    search: Optional[str] = Query(None, description="Search by name or phone"),
    employee_id: Optional[int] = Query(None, description="Filter by executive (Admin only)"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = LeadService(db)
    leads, total = await svc.list_leads(
        current_user=current_user,
        source=source,
        status_filter=status,
        search=search,
        filter_employee_id=employee_id,
        limit=limit,
        offset=offset,
    )
    return {
        "items": [lead.model_dump() for lead in leads],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.post("", response_model=LeadRead)
async def create_lead(
    data: LeadCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = LeadService(db)
    return await svc.create_lead(data, current_user)


@router.post("/{lead_id}/call-outcome", response_model=LeadRead)
async def record_call_outcome(
    lead_id: int,
    outcome: LeadCallOutcome,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = LeadService(db)
    return await svc.record_call_outcome(lead_id, outcome, current_user)


@router.get("/{lead_id}/call-logs", response_model=List[LeadCallLogRead])
async def get_lead_call_logs(
    lead_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve all call logs and customer feedback remarks for a lead."""
    svc = LeadService(db)
    return await svc.get_call_logs(lead_id, current_user)


@router.delete("/{lead_id}", response_model=dict)
async def delete_lead(
    lead_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a lead permanently. Admin and Sub-Admin only."""
    svc = LeadService(db)
    await svc.delete_lead(lead_id, current_user)
    return {"success": True, "message": "Lead deleted successfully"}
