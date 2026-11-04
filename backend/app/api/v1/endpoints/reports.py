"""Reports CRUD endpoints."""
from __future__ import annotations

from datetime import date
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import get_current_user, require_admin
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
from app.schemas.performance_collection_report import (
    PerformanceCollectionReportResponse,
    MilestoneCheckpointsBulkSaveRequest,
    MilestoneCheckpointRead,
    CustomerDetailResponse,
)
from app.schemas.executive_collection_report import ExecutiveCollectionReportResponse
from app.services.report_service import ReportService
from app.services.dashboard_service import DashboardService
from app.services.performance_collection_service import PerformanceCollectionService
from app.services.executive_collection_service import ExecutiveCollectionService

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


@router.get("/employee-performance-collection", response_model=PerformanceCollectionReportResponse)
async def get_employee_performance_collection_report(
    month: Optional[str] = Query(None, description="Month format YYYY-MM (e.g. 2026-11)"),
    employee_id: Optional[int] = Query(None, description="Filter by employee"),
    date_from: Optional[date] = Query(None, description="Start date filter"),
    date_to: Optional[date] = Query(None, description="End date filter"),
    lead_status: Optional[str] = Query(None, description="Filter by customer lead status (HP, P, FUB, NI)"),
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Generate Section 1 (Employee Monthly Performance) & Section 2 (Customer Collection Ledger) report."""
    svc = PerformanceCollectionService(db)
    return await svc.get_report_data(
        current_user=current_user,
        month_str=month,
        employee_id=employee_id,
        date_from=date_from,
        date_to=date_to,
        lead_status_filter=lead_status,
    )


@router.get("/executive-collection", response_model=ExecutiveCollectionReportResponse)
async def get_executive_collection_report(
    date: Optional[date] = Query(None, description="Report target date (e.g. 2026-11-03)"),
    team_id: Optional[int] = Query(None, description="Optional team filter"),
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Generate Executive Wise Collection Sheet matching the executive team layout."""
    svc = ExecutiveCollectionService(db)
    return await svc.get_report_data(report_date=date, team_id=team_id)


@router.get("/customer-detail", response_model=Optional[CustomerDetailResponse])
async def get_customer_detail(
    customer_code: Optional[str] = Query(None, description="Customer code (e.g. CX-1001)"),
    customer_name: Optional[str] = Query(None, description="Customer name"),
    customer_phone: Optional[str] = Query(None, description="Customer phone number"),
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Fetch complete customer transactions, collection ledger and history (Admin Only)."""
    svc = PerformanceCollectionService(db)
    detail = await svc.get_customer_detail(
        customer_code=customer_code,
        customer_phone=customer_phone,
        customer_name=customer_name,
    )
    if detail is None:
        raise HTTPException(status_code=404, detail="Customer details not found")
    return detail


@router.post("/milestone-checkpoints", response_model=List[MilestoneCheckpointRead])
async def save_milestone_checkpoints(
    data: MilestoneCheckpointsBulkSaveRequest,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Save manual milestone checkpoints review session data (Admin Only).
    Supports both company-wide (employee_id is null) and per-employee entry.
    """
    svc = PerformanceCollectionService(db)
    return await svc.save_milestone_checkpoints(data, current_user)


@router.get("/milestone-checkpoints", response_model=List[MilestoneCheckpointRead])
async def get_milestone_checkpoints(
    month: str = Query(..., description="Month in YYYY-MM format"),
    employee_id: Optional[int] = Query(None, description="Employee ID or None for company-wide"),
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get manual milestone checkpoints for the specified month and scope."""
    svc = PerformanceCollectionService(db)
    return await svc.get_milestone_checkpoints(month, employee_id)


@router.delete("/milestone-checkpoints", status_code=200)
async def reset_milestone_checkpoints(
    month: str = Query(..., description="Month in YYYY-MM format"),
    employee_id: Optional[int] = Query(None, description="Employee ID or None for company-wide"),
    checkpoint_day: Optional[int] = Query(None, description="Optional specific checkpoint day (5, 10, etc.)"),
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Reset manual checkpoints to revert back to auto-calculated report figures."""
    svc = PerformanceCollectionService(db)
    count = await svc.reset_milestone_checkpoints(month, employee_id, checkpoint_day)
    return {"message": f"Successfully reset {count} manual checkpoint(s).", "count": count}


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
