"""LeadRepository — database operations for leads and call logs."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional, Tuple
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.lead import Lead, LeadCallLog, LeadTransferLog


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
                selectinload(Lead.delegated_to),
                selectinload(Lead.onboarded_by),
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
        delegation_filter: Optional[str] = None,
        is_active: bool = True,
        limit: int = 100,
        offset: int = 0,
    ) -> Tuple[List[Lead], int]:
        stmt = select(Lead).where(Lead.is_active == is_active)

        if assigned_to_id is not None:
            if delegation_filter == "delegated_to_me":
                stmt = stmt.where(Lead.delegated_to_id == assigned_to_id)
            elif delegation_filter == "owned_only":
                stmt = stmt.where(Lead.assigned_to_id == assigned_to_id)
            elif delegation_filter == "delegated_by_me":
                stmt = stmt.where(Lead.assigned_to_id == assigned_to_id, Lead.delegated_to_id.isnot(None))
            else:
                # Default: Show both leads owned by user and leads delegated to user
                stmt = stmt.where(or_(Lead.assigned_to_id == assigned_to_id, Lead.delegated_to_id == assigned_to_id))
        elif delegation_filter == "all_delegated":
            # For admin/supervisor to view all currently delegated leads across company
            stmt = stmt.where(Lead.delegated_to_id.isnot(None))

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
                selectinload(Lead.delegated_to),
                selectinload(Lead.onboarded_by),
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

    async def list_onboarded_leads(
        self,
        assigned_to_id: Optional[int] = None,
        search: Optional[str] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> Tuple[List[Lead], int, int, int, int]:
        """
        List onboarded leads (is_onboarded == True) with metrics.
        Returns: (leads, filtered_total, total_all_time, total_today, total_this_month)
        """
        from datetime import timedelta
        dhaka_now = datetime.now(timezone.utc) + timedelta(hours=6)
        dhaka_today = dhaka_now.date()
        month_start = dhaka_today.replace(day=1)

        base_stmt = select(Lead).where(Lead.is_onboarded == True)
        if assigned_to_id is not None:
            base_stmt = base_stmt.where(
                or_(
                    Lead.assigned_to_id == assigned_to_id,
                    Lead.onboarded_by_id == assigned_to_id,
                )
            )

        # 1. Total all-time onboarded for scope
        tot_all_stmt = select(func.count(Lead.id)).select_from(base_stmt.subquery())
        res_tot = await self.db.execute(tot_all_stmt)
        total_all_time = res_tot.scalar_one() or 0

        # 2. Total today
        tot_today_stmt = select(func.count(Lead.id)).select_from(
            base_stmt.where(func.date(Lead.onboarded_at) == dhaka_today).subquery()
        )
        res_today = await self.db.execute(tot_today_stmt)
        total_today = res_today.scalar_one() or 0

        # 3. Total this month
        tot_month_stmt = select(func.count(Lead.id)).select_from(
            base_stmt.where(func.date(Lead.onboarded_at) >= month_start).subquery()
        )
        res_month = await self.db.execute(tot_month_stmt)
        total_this_month = res_month.scalar_one() or 0

        # 4. Filtered query
        query_stmt = base_stmt
        if search and search.strip():
            term = f"%{search.strip()}%"
            query_stmt = query_stmt.where(or_(Lead.name.ilike(term), Lead.phone.ilike(term)))
        if date_from:
            query_stmt = query_stmt.where(func.date(Lead.onboarded_at) >= date_from)
        if date_to:
            query_stmt = query_stmt.where(func.date(Lead.onboarded_at) <= date_to)

        count_stmt = select(func.count(Lead.id)).select_from(query_stmt.subquery())
        res_count = await self.db.execute(count_stmt)
        filtered_total = res_count.scalar_one() or 0

        paged_stmt = (
            query_stmt.options(
                selectinload(Lead.assigned_to),
                selectinload(Lead.created_by),
                selectinload(Lead.delegated_to),
                selectinload(Lead.onboarded_by),
                selectinload(Lead.call_logs),
            )
            .order_by(Lead.onboarded_at.desc().nullslast(), Lead.id.desc())
            .limit(limit)
            .offset(offset)
        )
        res_paged = await self.db.execute(paged_stmt)
        leads = list(res_paged.scalars().all())

        return leads, filtered_total, total_all_time, total_today, total_this_month

    async def get_summary_counts(self, assigned_to_id: Optional[int] = None) -> dict:
        """
        Calculates status counts grouped by source for:
        fb_lead, fair_lead, cold_lead, reference.
        Includes delegated leads if assigned_to_id is specified.
        """
        stmt = (
            select(Lead.source, Lead.status, func.count(Lead.id))
            .where(Lead.is_active == True)
        )
        if assigned_to_id is not None:
            stmt = stmt.where(or_(Lead.assigned_to_id == assigned_to_id, Lead.delegated_to_id == assigned_to_id))
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

    async def get_transfer_preview(self, from_employee_id: int) -> dict:
        """
        Count active leads owned by an executive broken down by status and source
        before executing a transfer/handover.
        """
        stmt = (
            select(Lead.source, Lead.status, func.count(Lead.id))
            .where(Lead.assigned_to_id == from_employee_id, Lead.is_active == True)
            .group_by(Lead.source, Lead.status)
        )
        res = await self.db.execute(stmt)
        rows = res.all()

        total = 0
        hp_count = 0
        p_count = 0
        fup_count = 0
        ni_count = 0
        nr_count = 0
        source_counts: dict = {}

        for src, stat, count in rows:
            s_clean = (src or "cold_lead").lower().strip()
            st_clean = (stat or "fup").lower().strip()
            total += count
            source_counts[s_clean] = source_counts.get(s_clean, 0) + count

            if st_clean == "hp":
                hp_count += count
            elif st_clean == "p":
                p_count += count
            elif st_clean in ("fup", "fub"):
                fup_count += count
            elif st_clean == "ni":
                ni_count += count
            elif st_clean == "nr":
                nr_count += count

        return {
            "total_leads": total,
            "hp_count": hp_count,
            "p_count": p_count,
            "fup_count": fup_count,
            "ni_count": ni_count,
            "nr_count": nr_count,
            "source_counts": source_counts,
        }

    async def execute_lead_transfer(
        self,
        from_employee_id: int,
        to_employee_id: int,
        transferred_by_id: int,
        from_employee_name: str,
        to_employee_name: str,
        transferred_by_name: str,
        lead_ids: Optional[List[int]] = None,
        statuses: Optional[List[str]] = None,
        sources: Optional[List[str]] = None,
        reason: Optional[str] = None,
    ) -> int:
        """
        Permanently transfer lead ownership from one executive to another.
        Creates transfer audit log and lead call history note.
        """
        stmt = select(Lead).where(
            Lead.assigned_to_id == from_employee_id,
            Lead.is_active == True,
        )

        if lead_ids:
            stmt = stmt.where(Lead.id.in_(lead_ids))
        if statuses:
            stmt = stmt.where(Lead.status.in_([s.lower().strip() for s in statuses]))
        if sources:
            stmt = stmt.where(Lead.source.in_([s.lower().strip() for s in sources]))

        res = await self.db.execute(stmt)
        leads = res.scalars().all()
        now = datetime.now(timezone.utc)
        clean_reason = reason.strip() if reason else "Employee job switch / Resignation handover"

        count = 0
        for l in leads:
            # 1. Create LeadTransferLog audit record
            transfer_log = LeadTransferLog(
                lead_id=l.id,
                from_employee_id=from_employee_id,
                to_employee_id=to_employee_id,
                transferred_by_id=transferred_by_id,
                lead_status_at_transfer=l.status,
                reason=clean_reason,
                transferred_at=now,
            )
            self.db.add(transfer_log)

            # 2. Add an audit entry to LeadCallLog so caller timeline clearly shows the handover
            audit_call_log = LeadCallLog(
                lead_id=l.id,
                caller_id=transferred_by_id,
                from_status=l.status,
                to_status=l.status,
                called_at=now,
                call_duration_seconds=0,
                notes=(
                    f"[Lead Handover] Transferred from {from_employee_name} to {to_employee_name} "
                    f"by Admin {transferred_by_name}. Reason: {clean_reason}"
                ),
            )
            self.db.add(audit_call_log)

            # 3. Update ownership & clear any temporary delegation
            l.assigned_to_id = to_employee_id
            l.delegated_to_id = None
            l.delegated_at = None
            l.delegation_notes = None
            l.updated_at = now
            count += 1

        await self.db.flush()
        return count

    async def get_transfer_logs(
        self,
        from_employee_id: Optional[int] = None,
        to_employee_id: Optional[int] = None,
        lead_id: Optional[int] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[LeadTransferLog]:
        stmt = (
            select(LeadTransferLog)
            .options(
                selectinload(LeadTransferLog.lead),
                selectinload(LeadTransferLog.from_employee),
                selectinload(LeadTransferLog.to_employee),
                selectinload(LeadTransferLog.transferred_by),
            )
            .order_by(LeadTransferLog.transferred_at.desc())
        )

        if from_employee_id is not None:
            stmt = stmt.where(LeadTransferLog.from_employee_id == from_employee_id)
        if to_employee_id is not None:
            stmt = stmt.where(LeadTransferLog.to_employee_id == to_employee_id)
        if lead_id is not None:
            stmt = stmt.where(LeadTransferLog.lead_id == lead_id)

        stmt = stmt.limit(limit).offset(offset)
        res = await self.db.execute(stmt)
        return list(res.scalars().all())

    async def get_pipeline_summary(self) -> dict:
        """
        Aggregate lead pipeline metrics across all employees:
        - Total company leads, HP, P, FUP, NI, NR
        - Employee-by-employee HP, P, FUP, NI, NR breakdown
        - Team / Director hierarchy
        - Workload classification
        - Unassigned leads
        """
        from app.models.user import User

        # 1. Fetch all users with team and manager
        users_stmt = (
            select(User)
            .options(
                selectinload(User.team),
                selectinload(User.reporting_manager),
            )
            .order_by(User.full_name.asc())
        )
        res_users = await self.db.execute(users_stmt)
        users = list(res_users.scalars().all())

        # 2. Get lead counts grouped by assigned_to_id and status
        status_stmt = (
            select(Lead.assigned_to_id, Lead.status, func.count(Lead.id))
            .where(Lead.is_active == True)
            .group_by(Lead.assigned_to_id, Lead.status)
        )
        res_status = await self.db.execute(status_stmt)
        status_rows = res_status.all()

        # 3. Get lead counts grouped by assigned_to_id and source
        source_stmt = (
            select(Lead.assigned_to_id, Lead.source, func.count(Lead.id))
            .where(Lead.is_active == True)
            .group_by(Lead.assigned_to_id, Lead.source)
        )
        res_source = await self.db.execute(source_stmt)
        source_rows = res_source.all()

        # 4. Fetch unassigned leads
        unassigned_count_stmt = (
            select(func.count(Lead.id))
            .where(Lead.is_active == True, or_(Lead.assigned_to_id == None, Lead.assigned_to_id == 0))
        )
        unassigned_total = (await self.db.execute(unassigned_count_stmt)).scalar() or 0

        unassigned_stmt = (
            select(Lead)
            .where(Lead.is_active == True, or_(Lead.assigned_to_id == None, Lead.assigned_to_id == 0))
            .order_by(Lead.created_at.desc())
            .limit(20)
        )
        res_unassigned = await self.db.execute(unassigned_stmt)
        unassigned_leads = list(res_unassigned.scalars().all())

        # Build lookup tables
        emp_stats: dict[int, dict] = {}
        for emp_id, stat, cnt in status_rows:
            if not emp_id:
                continue
            if emp_id not in emp_stats:
                emp_stats[emp_id] = {"hp": 0, "p": 0, "fup": 0, "ni": 0, "nr": 0, "total": 0}
            clean_s = (stat or "fup").lower().strip()
            if clean_s == "hp":
                emp_stats[emp_id]["hp"] += cnt
            elif clean_s == "p":
                emp_stats[emp_id]["p"] += cnt
            elif clean_s in ("fup", "fub"):
                emp_stats[emp_id]["fup"] += cnt
            elif clean_s == "ni":
                emp_stats[emp_id]["ni"] += cnt
            elif clean_s == "nr":
                emp_stats[emp_id]["nr"] += cnt
            emp_stats[emp_id]["total"] += cnt

        emp_sources: dict[int, dict] = {}
        for emp_id, src, cnt in source_rows:
            if not emp_id:
                continue
            if emp_id not in emp_sources:
                emp_sources[emp_id] = {}
            clean_src = (src or "cold_lead").lower().strip()
            emp_sources[emp_id][clean_src] = emp_sources[emp_id].get(clean_src, 0) + cnt

        # Totals across company
        total_leads = sum(s["total"] for s in emp_stats.values()) + unassigned_total
        total_hp = sum(s["hp"] for s in emp_stats.values())
        total_p = sum(s["p"] for s in emp_stats.values())
        total_fup = sum(s["fup"] for s in emp_stats.values())
        total_ni = sum(s["ni"] for s in emp_stats.values())
        total_nr = sum(s["nr"] for s in emp_stats.values())

        # Build employee pipeline items
        employee_items = []
        for u in users:
            stats = emp_stats.get(u.id, {"hp": 0, "p": 0, "fup": 0, "ni": 0, "nr": 0, "total": 0})
            sources = emp_sources.get(u.id, {})

            active_cnt = stats["total"]
            if active_cnt < 30:
                workload = "available"
            elif active_cnt <= 80:
                workload = "optimal"
            elif active_cnt <= 150:
                workload = "heavy"
            else:
                workload = "overloaded"

            team_name = u.team.name if u.team else None
            director_name = u.team.director_name if u.team else None
            manager_name = u.reporting_manager.full_name if u.reporting_manager else None

            role_str = u.role.value if hasattr(u.role, "value") else str(u.role)

            employee_items.append({
                "id": u.id,
                "full_name": u.full_name,
                "username": u.username,
                "email": u.email,
                "phone": u.phone,
                "designation": u.designation or role_str,
                "role": role_str,
                "team_id": u.team_id,
                "team_name": team_name,
                "director_name": director_name,
                "manager_name": manager_name,
                "is_active": u.is_active,
                "total_leads": stats["total"],
                "hp_count": stats["hp"],
                "p_count": stats["p"],
                "fup_count": stats["fup"],
                "ni_count": stats["ni"],
                "nr_count": stats["nr"],
                "workload_level": workload,
                "source_counts": sources,
                "sample_leads": [],
            })

        # Sort employees: first by total_leads descending, then hp_count descending
        employee_items.sort(key=lambda x: (x["total_leads"], x["hp_count"]), reverse=True)

        unassigned_samples_data = [
            {
                "id": l.id,
                "name": l.name,
                "phone": l.phone,
                "source": l.source,
                "status": l.status,
                "created_at": l.created_at.strftime("%Y-%m-%d %H:%M") if l.created_at else "",
            }
            for l in unassigned_leads
        ]

        return {
            "overview": {
                "total_leads": total_leads,
                "hp_count": total_hp,
                "p_count": total_p,
                "fup_count": total_fup,
                "ni_count": total_ni,
                "nr_count": total_nr,
                "unassigned_leads": unassigned_total,
                "total_executives": len(users),
            },
            "employees": employee_items,
            "unassigned_samples": unassigned_samples_data,
        }

