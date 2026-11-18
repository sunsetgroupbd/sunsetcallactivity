"""LeadRepository — database operations for leads and call logs."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional, Tuple
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.lead import Lead, LeadCallLog


class LeadRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_by_id(self, lead_id: int) -> Optional[Lead]:
        stmt = (
            select(Lead)
            .where(Lead.id == lead_id)
            .options(
                selectinload(Lead.assigned_to),
                selectinload(Lead.created_by),
                selectinload(Lead.call_logs),
            )
        )
        res = await self.db.execute(stmt)
        return res.scalar_one_or_none()

    async def create(self, lead: Lead) -> Lead:
        self.db.add(lead)
        await self.db.flush()
        await self.db.refresh(lead)
        return lead

    async def update(self, lead: Lead) -> Lead:
        await self.db.flush()
        await self.db.refresh(lead)
        return lead

    async def delete(self, lead: Lead) -> None:
        await self.db.delete(lead)
        await self.db.flush()

    async def list_leads(
        self,
        assigned_to_id: Optional[int] = None,
        source: Optional[str] = None,
        status: Optional[str] = None,
        search: Optional[str] = None,
        is_active: bool = True,
        limit: int = 100,
        offset: int = 0,
    ) -> Tuple[List[Lead], int]:
        stmt = select(Lead).where(Lead.is_active == is_active)

        if assigned_to_id is not None:
            stmt = stmt.where(Lead.assigned_to_id == assigned_to_id)
        if source and source != "all":
            stmt = stmt.where(Lead.source == source.lower().strip())
        if status and status != "all":
            stmt = stmt.where(Lead.status == status.lower().strip())
        if search and search.strip():
            term = f"%{search.strip()}%"
            stmt = stmt.where(or_(Lead.name.ilike(term), Lead.phone.ilike(term)))

        # Count total matches
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_res = await self.db.execute(count_stmt)
        total = total_res.scalar_one() or 0

        # Load paginated records with relationships
        stmt = (
            stmt.options(
                selectinload(Lead.assigned_to),
                selectinload(Lead.created_by),
                selectinload(Lead.call_logs),
            )
            .order_by(
                Lead.last_called_at.desc().nullslast(),
                Lead.id.desc(),
            )
            .limit(limit)
            .offset(offset)
        )

        res = await self.db.execute(stmt)
        return list(res.scalars().all()), total

    async def get_summary_counts(self, assigned_to_id: Optional[int] = None) -> dict:
        """
        Calculates status counts grouped by source for:
        fb_lead, fair_lead, cold_lead, reference.
        """
        stmt = (
            select(Lead.source, Lead.status, func.count(Lead.id))
            .where(Lead.is_active == True)
        )
        if assigned_to_id is not None:
            stmt = stmt.where(Lead.assigned_to_id == assigned_to_id)
        stmt = stmt.group_by(Lead.source, Lead.status)

        res = await self.db.execute(stmt)
        raw_counts = res.all()

        summary: dict = {
            "fb_lead": {"hp": 0, "p": 0, "fup": 0, "ni": 0, "nr": 0, "total": 0},
            "fair_lead": {"hp": 0, "p": 0, "fup": 0, "ni": 0, "nr": 0, "total": 0},
            "cold_lead": {"hp": 0, "p": 0, "fup": 0, "ni": 0, "nr": 0, "total": 0},
            "reference": {"hp": 0, "p": 0, "fup": 0, "ni": 0, "nr": 0, "total": 0},
        }

        total_active = 0
        for src, stat, count in raw_counts:
            s_clean = (src or "").lower().strip()
            st_clean = (stat or "").lower().strip()
            if s_clean in summary:
                if st_clean in summary[s_clean]:
                    summary[s_clean][st_clean] = count
                summary[s_clean]["total"] += count
                total_active += count

        # Today's calls count for this user
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        call_stmt = select(func.count(LeadCallLog.id)).where(LeadCallLog.called_at >= today_start)
        if assigned_to_id is not None:
            call_stmt = call_stmt.where(LeadCallLog.caller_id == assigned_to_id)
        call_res = await self.db.execute(call_stmt)
        today_calls = call_res.scalar_one() or 0

        summary["total_active_leads"] = total_active
        summary["today_calls_made"] = today_calls
        return summary

    async def log_call(
        self,
        lead: Lead,
        caller_id: int,
        from_status: Optional[str],
        to_status: str,
        duration: Optional[int] = None,
        notes: Optional[str] = None,
    ) -> LeadCallLog:
        now = datetime.now(timezone.utc)
        call_log = LeadCallLog(
            lead_id=lead.id,
            caller_id=caller_id,
            from_status=from_status,
            to_status=to_status,
            called_at=now,
            call_duration_seconds=duration,
            notes=notes,
        )
        self.db.add(call_log)

        # Update Lead status & metadata
        lead.status = to_status
        lead.last_called_at = now
        lead.total_calls_count = (lead.total_calls_count or 0) + 1
        lead.updated_at = now
        if notes:
            lead.notes = notes

        await self.db.flush()
        return call_log
