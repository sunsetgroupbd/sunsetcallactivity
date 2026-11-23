"""CRM integration endpoints — Admin only."""
from __future__ import annotations

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import get_current_user
from app.db.session import get_db
from app.models.user import User, UserRole
from app.services.crm_service import CrmService

router = APIRouter(prefix="/crm", tags=["CRM Integration"])


class PhoneDeduplicatePayload(BaseModel):
    phones: List[str]


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


@router.get("/pipeline-summary")
async def get_crm_pipeline_summary(
    force_refresh: bool = Query(False, description="Bypass cache and re-fetch from CRM"),
    time_range: str = Query("this_month", description="Time window: this_month, last_month, last_90_days, all_time"),
    from_date: Optional[str] = Query(None, description="Custom start date (YYYY-MM-DD)"),
    to_date: Optional[str] = Query(None, description="Custom end date (YYYY-MM-DD)"),
    limit: Optional[int] = Query(None, description="Legacy limit override"),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Aggregate Somikoron CRM leads by assigned executive for selected time window or full CRM.
    Restricted to Administrators and Sub-Administrators.
    """
    _require_admin(current_user)
    svc = CrmService()
    return await svc.get_pipeline_summary(
        force_refresh=force_refresh,
        limit=limit,
        time_range=time_range,
        from_date=from_date,
        to_date=to_date,
    )


@router.get("/executives/{executive_name}/leads")
async def get_crm_executive_leads(
    executive_name: str,
    time_range: str = Query("this_month", description="Time window"),
    status: Optional[str] = Query(None, description="Filter by status"),
    query: Optional[str] = Query(None, description="Search keyword inside executive leads"),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Executive-Wise Live Drilldown: Return leads for a specific executive.
    Restricted to Administrators and Sub-Administrators.
    """
    _require_admin(current_user)
    svc = CrmService()
    return await svc.get_executive_leads(
        executive_name=executive_name,
        time_range=time_range,
        status=status,
        query=query,
    )


@router.post("/full-sync/start")
async def start_crm_full_sync(
    batch_size: int = Query(1000, ge=100, le=2000),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Start full background aggregation across all 53,000+ CRM leads."""
    _require_admin(current_user)
    svc = CrmService()
    return await svc.start_full_sync(batch_size=batch_size)


@router.get("/full-sync/status")
async def get_crm_full_sync_status(
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Check live status of the full CRM lead sync."""
    _require_admin(current_user)
    svc = CrmService()
    return svc.get_sync_status()


@router.post("/full-sync/cancel")
async def cancel_crm_full_sync(
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Cancel ongoing full CRM sync."""
    _require_admin(current_user)
    svc = CrmService()
    return svc.cancel_sync()


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


@router.get("/phone-index-status")
async def get_crm_phone_index_status(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Check how many leads are indexed and whether background sync is currently running."""
    _require_admin(current_user)
    svc = CrmService()
    return await svc.get_phone_index_status(db)


@router.post("/sync-phone-index")
async def sync_crm_phone_index(
    batch_size: int = Query(2500, ge=500, le=5000),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Start background sync of all 53k+ Somikoron CRM leads into crm_phone_index."""
    _require_admin(current_user)
    svc = CrmService()
    return await svc.start_phone_index_sync(batch_size=batch_size)


@router.post("/cancel-phone-index-sync")
async def cancel_crm_phone_index_sync(
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Cancel running CRM phone index sync."""
    _require_admin(current_user)
    svc = CrmService()
    return svc.cancel_phone_index_sync()


@router.post("/deduplicate")
async def deduplicate_crm_phones(
    payload: PhoneDeduplicatePayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Check uploaded phone numbers against the CRM phone index.
    Filters out any numbers that already exist in Somikoron CRM.
    Returns clean (fresh) numbers and details of matched duplicate leads.
    """
    _require_admin(current_user)
    svc = CrmService()
    return await svc.deduplicate_phones(payload.phones, db)

