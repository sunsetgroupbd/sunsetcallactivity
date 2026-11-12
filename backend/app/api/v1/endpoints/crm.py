"""CRM integration endpoints — Admin only."""
from __future__ import annotations

from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.permissions import get_current_user
from app.models.user import User, UserRole
from app.services.crm_service import CrmService

router = APIRouter(prefix="/crm", tags=["CRM Integration"])


def _require_admin(user: User) -> None:
    if user.role not in (UserRole.ADMIN, UserRole.SUB_ADMIN):
        raise HTTPException(
            status_code=403,
            detail="Access denied. Only Administrators and Sub-Administrators can access CRM leads.",
        )


@router.get("/status")
async def get_crm_status(current_user: User = Depends(get_current_user)) -> Dict[str, Any]:
    """Check whether external CRM integration is configured."""
    _require_admin(current_user)
    svc = CrmService()
    return {
        "configured": svc.is_configured(),
        "base_url": svc.base_url,
        "leads_url": svc.leads_url,
        "username_configured": bool(svc.username),
        "auth_token_configured": bool(svc.auth_token),
    }


@router.get("/debug")
async def debug_crm_connection(current_user: User = Depends(get_current_user)) -> Dict[str, Any]:
    """Diagnostic probe for testing CRM connection step-by-step."""
    _require_admin(current_user)
    svc = CrmService()
    return await svc.debug_connection()


@router.get("/leads")
async def get_crm_leads(
    force_refresh: bool = Query(False, description="Bypass cache and fetch live from CRM"),
    query: Optional[str] = Query(None, description="Search keyword in leads"),
    status: Optional[str] = Query(None, description="Filter by lead status"),
    from_date: Optional[str] = Query("1971-01-01", description="Filter from date (YYYY-MM-DD)"),
    to_date: Optional[str] = Query(None, description="Filter to date (YYYY-MM-DD)"),
    active_status: Optional[str] = Query("Active", description="Active status filter (Active, all)"),
    order_dir: Optional[str] = Query("desc", description="Sort direction (desc, asc)"),
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(100, ge=10, le=1000, description="Items per page"),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Fetch lead records from Somikoron CRM with pagination support.
    Strictly restricted to Admin and Sub-Admin accounts.
    """
    import math

    _require_admin(current_user)

    start = (page - 1) * per_page
    svc = CrmService()
    result = await svc.fetch_leads(
        force_refresh=force_refresh,
        length=per_page,
        start=start,
        search_query=query,
        from_date=from_date,
        to_date=to_date,
        active_status=active_status,
        order_dir=order_dir,
    )

    if not result.get("success", False):
        return result

    leads = result.get("leads", [])

    # Optional status filtering
    if status and status.lower() != "all":
        st = status.strip().lower()
        leads = [l for l in leads if l.get("status", "").lower() == st]

    rec_total = result.get("records_total")
    rec_filtered = result.get("records_filtered") or rec_total or len(leads)
    total_pages = math.ceil(rec_filtered / per_page) if rec_filtered else 1

    return {
        "success": True,
        "leads": leads,
        "total": len(leads),
        "raw_total": result.get("total", len(leads)),
        "records_total": rec_total,
        "records_filtered": rec_filtered,
        "page": page,
        "per_page": per_page,
        "total_pages": total_pages,
        "from_cache": result.get("from_cache", False),
        "fetched_at": result.get("fetched_at"),
    }

