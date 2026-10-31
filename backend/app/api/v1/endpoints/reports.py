"""Reports CRUD endpoints."""
from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import get_current_user
from app.db.session import get_db
from app.models.report import ReportStatus
from app.models.user import User
from app.schemas.report import (
    PaginatedReports,
    ReportCreate,
    ReportListItem,
    ReportRead,
    ReportUpdate,
)
from app.schemas.dashboard import ReportSummary
from app.services.report_service import ReportService
from app.services.dashboard_service import DashboardService

router = APIRouter(prefix="/reports", tags=["Reports"])


@router.post("", response_model=ReportRead, status_code=201)
async def create_report(
    data: ReportCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = ReportService(db)
    return await svc.create_report(data, current_user)


@router.get("", response_model=PaginatedReports)
async def list_reports(
    employee_id: Optional[int] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    status: Optional[ReportStatus] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    skip = (page - 1) * page_size
    svc = ReportService(db)
    total, items = await svc.list_reports(
        current_user=current_user,
        employee_id=employee_id,
        date_from=date_from,
        date_to=date_to,
        status_filter=status,
        skip=skip,
        limit=page_size,
    )
    return PaginatedReports(total=total, page=page, page_size=page_size, items=list(items))


@router.get("/by-date/{report_date}", response_model=ReportRead)
async def get_report_by_date(
    report_date: date,
    employee_id: Optional[int] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = ReportService(db)
    return await svc.get_report_by_date(report_date, current_user, employee_id)


@router.get("/{report_id}", response_model=ReportRead)
async def get_report(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = ReportService(db)
    return await svc.get_report(report_id, current_user)


@router.put("/{report_id}", response_model=ReportRead)
async def update_report(
    report_id: int,
    data: ReportUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = ReportService(db)
    return await svc.update_report(report_id, data, current_user)


@router.delete("/{report_id}", status_code=204)
async def delete_report(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = ReportService(db)
    await svc.delete_report(report_id, current_user)


@router.post("/{report_id}/submit", response_model=ReportRead)
async def submit_report(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = ReportService(db)
    return await svc.submit_report(report_id, current_user)


@router.post("/{report_id}/reopen", response_model=ReportRead)
async def reopen_report(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = ReportService(db)
    return await svc.reopen_report(report_id, current_user)


@router.get("/{report_id}/summary", response_model=ReportSummary)
async def get_report_summary(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Access check — reuse service
    svc = ReportService(db)
    await svc.get_report(report_id, current_user)  # raises 404/403 as needed
    dash_svc = DashboardService(db)
    summary = await dash_svc.get_report_summary(report_id)
    if summary is None:
        raise HTTPException(status_code=404, detail="Report summary not found")
    return summary
