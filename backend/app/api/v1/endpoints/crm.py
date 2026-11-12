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


@router.get("/leads")
async def get_crm_leads(
    force_refresh: bool = Query(False, description="Bypass cache and fetch live from CRM"),
    query: Optional[str] = Query(None, description="Search keyword in leads"),
    status: Optional[str] = Query(None, description="Filter by lead status"),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Fetch lead records from Somikoron CRM.
    Strictly restricted to Admin and Sub-Admin accounts.
    """
    _require_admin(current_user)

    svc = CrmService()
    result = await svc.fetch_leads(force_refresh=force_refresh)

    if not result.get("success", False):
        return result

    leads = result.get("leads", [])

    # Optional server-side keyword filtering
    if query:
        q = query.strip().lower()
        leads = [
            l for l in leads
            if q in l.get("name", "").lower()
            or q in l.get("phone", "").lower()
            or q in l.get("email", "").lower()
            or q in l.get("project", "").lower()
            or q in l.get("assigned_to", "").lower()
            or q in l.get("address", "").lower()
        ]

    # Optional status filtering
    if status and status.lower() != "all":
        st = status.strip().lower()
        leads = [l for l in leads if l.get("status", "").lower() == st]

    return {
        "success": True,
        "leads": leads,
        "total": len(leads),
        "raw_total": result.get("total", len(leads)),
        "from_cache": result.get("from_cache", False),
        "fetched_at": result.get("fetched_at"),
    }

