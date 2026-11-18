"""LeadService — business logic for lead-wise calling workflow and auto-reporting."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import List, Optional, Tuple

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.call_activity import CallActivityEntry
from app.models.lead import Lead, LeadCallLog
from app.models.report import DailyActivityReport, ReportStatus
from app.models.user import User, UserRole
from app.repositories.call_repo import CallActivityRepository
from app.repositories.lead_repo import LeadRepository
from app.repositories.report_repo import ReportRepository
from app.schemas.lead import (
    LeadCallLogRead,
    LeadCallOutcome,
    LeadCreate,
    LeadRead,
    LeadSummaryResponse,
    LeadUpdate,
)


def get_dhaka_date_and_time() -> Tuple[date, datetime, int]:
    """Returns (dhaka_today, dhaka_now_datetime, dhaka_hour)."""
    dhaka_now = datetime.now(timezone.utc) + timedelta(hours=6)
    return dhaka_now.date(), dhaka_now, dhaka_now.hour


class LeadService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.lead_repo = LeadRepository(db)
        self.report_repo = ReportRepository(db)
        self.call_repo = CallActivityRepository(db)

    @staticmethod
    def _map_source_to_call_category(source: str) -> str:
        s = (source or "").lower().strip()
        if "fb" in s or "facebook" in s:
            return "Facebook"
        if "fair" in s:
            return "Fair Leads"
        if "cold" in s:
            return "New Cold Leads"
        if "ref" in s:
            return "Other & Not Reached"
        return "Other & Not Reached"

    async def get_summary(
        self,
        current_user: User,
        filter_employee_id: Optional[int] = None,
    ) -> LeadSummaryResponse:
        # If employee, strictly restrict to their own leads
        is_supervisor = current_user.role in (UserRole.ADMIN, UserRole.SUB_ADMIN)
        target_emp_id = filter_employee_id if (is_supervisor and filter_employee_id) else (
            None if is_supervisor and not filter_employee_id else current_user.id
        )

        counts = await self.lead_repo.get_summary_counts(target_emp_id)
        return LeadSummaryResponse(**counts)

    @staticmethod
    def _to_lead_read(l: Lead) -> LeadRead:
        call_logs_read: List[LeadCallLogRead] = []
        if l.call_logs:
            for log in l.call_logs:
                caller_name = log.caller.full_name if log.caller else None
                call_logs_read.append(
                    LeadCallLogRead(
                        id=log.id,
                        lead_id=log.lead_id,
                        caller_id=log.caller_id,
                        caller_name=caller_name,
                        from_status=log.from_status,
                        to_status=log.to_status,
                        called_at=log.called_at,
                        call_duration_seconds=log.call_duration_seconds,
                        notes=log.notes,
                    )
                )

        latest_call_read = call_logs_read[0] if call_logs_read else None

        return LeadRead(
            id=l.id,
            name=l.name,
            phone=l.phone,
            source=l.source,
            status=l.status,
            assigned_to_id=l.assigned_to_id,
            assigned_to_name=l.assigned_to.full_name if l.assigned_to else None,
            created_by_id=l.created_by_id,
            lead_date=l.lead_date,
            last_called_at=l.last_called_at,
            total_calls_count=l.total_calls_count,
            notes=l.notes,
            is_active=l.is_active,
            created_at=l.created_at,
            updated_at=l.updated_at,
            latest_call=latest_call_read,
            call_logs=call_logs_read,
        )

    async def list_leads(
        self,
        current_user: User,
        source: Optional[str] = None,
        status_filter: Optional[str] = None,
        search: Optional[str] = None,
        filter_employee_id: Optional[int] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> Tuple[List[LeadRead], int]:
        is_supervisor = current_user.role in (UserRole.ADMIN, UserRole.SUB_ADMIN)
        target_emp_id = filter_employee_id if (is_supervisor and filter_employee_id) else (
            None if is_supervisor and not filter_employee_id else current_user.id
        )

        leads, total = await self.lead_repo.list_leads(
            assigned_to_id=target_emp_id,
            source=source,
            status=status_filter,
            search=search,
            limit=limit,
            offset=offset,
        )

        lead_reads = [self._to_lead_read(l) for l in leads]
        return lead_reads, total

    async def create_lead(self, data: LeadCreate, current_user: User) -> LeadRead:
        is_supervisor = current_user.role in (UserRole.ADMIN, UserRole.SUB_ADMIN)

        # Sales Executives can only assign to themselves; Admins can assign to any executive
        if is_supervisor:
            assigned_id = data.assigned_to_id or current_user.id
        else:
            assigned_id = current_user.id

        dhaka_today, _, _ = get_dhaka_date_and_time()

        lead = Lead(
            name=data.name.strip(),
            phone=data.phone.strip(),
            source=data.source.lower().strip(),
            status=data.status.lower().strip(),
            assigned_to_id=assigned_id,
            created_by_id=current_user.id,
            lead_date=dhaka_today,
            notes=data.notes.strip() if data.notes else None,
        )

        created = await self.lead_repo.create(lead)
        # Reload with relationships
        full_lead = await self.lead_repo.get_by_id(created.id)
        if not full_lead:
            raise HTTPException(status_code=500, detail="Failed to load created lead")

        return self._to_lead_read(full_lead)

    async def record_call_outcome(
        self,
        lead_id: int,
        outcome: LeadCallOutcome,
        current_user: User,
    ) -> LeadRead:
        lead = await self.lead_repo.get_by_id(lead_id)
        if not lead:
            raise HTTPException(status_code=404, detail="Lead not found")

        is_supervisor = current_user.role in (UserRole.ADMIN, UserRole.SUB_ADMIN)
        if not is_supervisor and lead.assigned_to_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized to log calls for this lead")

        old_status = lead.status
        new_status = outcome.new_status.lower().strip()
        notes = (outcome.notes or "").strip()

        # Validation: Remarks / Customer Feedback is mandatory for HP, P, FUP, NI. Only NR is optional.
        if new_status != "nr" and not notes:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Call Remarks / Customer Feedback is mandatory when call is connected (HP, P, FUP, NI). Only Not Reached (NR) can be saved without remarks.",
            )

        # 1. Save Call Log & update Lead status
        await self.lead_repo.log_call(
            lead=lead,
            caller_id=current_user.id,
            from_status=old_status,
            to_status=new_status,
            duration=outcome.call_duration_seconds,
            notes=notes if notes else None,
        )

        # 2. Automatic Reporting Bridge: Auto-update today's DailyActivityReport for this executive
        await self._auto_update_daily_call_report(
            executive_id=lead.assigned_to_id,
            lead_source=lead.source,
            new_status=new_status,
        )

        await self.db.commit()

        # Reload updated lead with relationships
        full_lead = await self.lead_repo.get_by_id(lead.id)
        if not full_lead:
            raise HTTPException(status_code=500, detail="Failed to load updated lead")

        return self._to_lead_read(full_lead)

    async def get_call_logs(self, lead_id: int, current_user: User) -> List[LeadCallLogRead]:
        lead = await self.lead_repo.get_by_id(lead_id)
        if not lead:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")

        is_supervisor = current_user.role in (UserRole.ADMIN, UserRole.SUB_ADMIN)
        if not is_supervisor and lead.assigned_to_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to view remarks for this lead",
            )

        lead_read = self._to_lead_read(lead)
        return lead_read.call_logs

    async def _auto_update_daily_call_report(
        self,
        executive_id: int,
        lead_source: str,
        new_status: str,
    ) -> None:
        """
        Automatically increments dial counts, time slots, and status breakdown
        on the executive's DailyActivityReport and CallActivityEntry for today.
        """
        dhaka_today, _, dhaka_hour = get_dhaka_date_and_time()

        # 1. Find or create today's DailyActivityReport
        report = await self.report_repo.get_by_employee_and_date(
            employee_id=executive_id, report_date=dhaka_today
        )
        if not report:
            report = DailyActivityReport(
                employee_id=executive_id,
                report_date=dhaka_today,
                status=ReportStatus.DRAFT,
            )
            self.db.add(report)
            await self.db.flush()

        # 2. Map lead source to CallActivityEntry lead_category
        category_name = self._map_source_to_call_category(lead_source)

        entry = await self.call_repo.get_by_report_and_category(
            report_id=report.id, lead_category=category_name
        )
        if not entry:
            entry = CallActivityEntry(
                report_id=report.id,
                lead_category=category_name,
                slot_10am_1pm=0,
                slot_2pm_5pm=0,
                slot_5pm_6pm=0,
                total_dialed=0,
                total_connected=0,
                lead_status_hp=0,
                lead_status_p=0,
                lead_status_fub=0,
                lead_status_ni=0,
            )
            self.db.add(entry)
            await self.db.flush()

        # 3. Determine time slot in Dhaka Time (UTC+6)
        # Standard business slots:
        # Slot 1: 10:00 AM – 1:00 PM (hour 10, 11, 12, 13)
        # Slot 2: 2:00 PM – 5:00 PM (hour 14, 15, 16)
        # Slot 3: 5:00 PM – 6:00 PM (hour 17, 18)
        if 10 <= dhaka_hour < 14:
            entry.slot_10am_1pm = (entry.slot_10am_1pm or 0) + 1
        elif 14 <= dhaka_hour < 17:
            entry.slot_2pm_5pm = (entry.slot_2pm_5pm or 0) + 1
        elif 17 <= dhaka_hour <= 19:
            entry.slot_5pm_6pm = (entry.slot_5pm_6pm or 0) + 1
        else:
            # Calls outside standard slots default to slot_10am_1pm or slot_5pm_6pm
            if dhaka_hour < 10:
                entry.slot_10am_1pm = (entry.slot_10am_1pm or 0) + 1
            else:
                entry.slot_5pm_6pm = (entry.slot_5pm_6pm or 0) + 1

        # 4. Total dialed is sum of slots
        entry.total_dialed = (
            (entry.slot_10am_1pm or 0)
            + (entry.slot_2pm_5pm or 0)
            + (entry.slot_5pm_6pm or 0)
        )

        # 5. Connected & Status counts
        st = new_status.lower().strip()
        if st != "nr":
            entry.total_connected = (entry.total_connected or 0) + 1

        if st == "hp":
            entry.lead_status_hp = (entry.lead_status_hp or 0) + 1
        elif st == "p":
            entry.lead_status_p = (entry.lead_status_p or 0) + 1
        elif st in ("fup", "fub"):
            entry.lead_status_fub = (entry.lead_status_fub or 0) + 1
        elif st == "ni":
            entry.lead_status_ni = (entry.lead_status_ni or 0) + 1

        await self.db.flush()

    async def delete_lead(self, lead_id: int, current_user: User) -> bool:
        """
        Delete a lead permanently.
        Restricted to Administrators and Sub-Administrators.
        """
        if current_user.role not in (UserRole.ADMIN, UserRole.SUB_ADMIN):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied. Only Administrators and Sub-Administrators can delete leads.",
            )

        lead = await self.lead_repo.get_by_id(lead_id)
        if not lead:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Lead with ID {lead_id} not found.",
            )

        await self.lead_repo.delete(lead)
        return True
