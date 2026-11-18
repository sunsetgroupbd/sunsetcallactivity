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
from app.schemas.user import UserRead


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
    def _to_lead_read(l: Lead, current_user_id: Optional[int] = None) -> LeadRead:
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
        delegated_to_name = l.delegated_to.full_name if getattr(l, "delegated_to", None) else None
        is_delegated_to_me = bool(current_user_id and l.delegated_to_id == current_user_id)
        is_delegated_by_me = bool(current_user_id and l.assigned_to_id == current_user_id and l.delegated_to_id is not None)

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
            delegated_to_id=l.delegated_to_id,
            delegated_to_name=delegated_to_name,
            delegated_at=l.delegated_at,
            delegation_notes=l.delegation_notes,
            is_delegated_to_me=is_delegated_to_me,
            is_delegated_by_me=is_delegated_by_me,
        )

    async def list_leads(
        self,
        current_user: User,
        source: Optional[str] = None,
        status_filter: Optional[str] = None,
        search: Optional[str] = None,
        filter_employee_id: Optional[int] = None,
        delegation_filter: Optional[str] = None,
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
            delegation_filter=delegation_filter,
            limit=limit,
            offset=offset,
        )

        lead_reads = [self._to_lead_read(l, current_user.id) for l in leads]
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
        is_owner = lead.assigned_to_id == current_user.id
        is_delegated = lead.delegated_to_id == current_user.id
        if not is_supervisor and not is_owner and not is_delegated:
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

        # 2. Automatic Reporting Bridge: Auto-update today's DailyActivityReport for the person who actually made the call
        await self._auto_update_daily_call_report(
            executive_id=current_user.id,
            lead_source=lead.source,
            new_status=new_status,
        )

        await self.db.commit()

        # Reload updated lead with relationships
        full_lead = await self.lead_repo.get_by_id(lead.id)
        if not full_lead:
            raise HTTPException(status_code=500, detail="Failed to load updated lead")

        return self._to_lead_read(full_lead, current_user.id)

    async def delegate_lead(
        self,
        lead_id: int,
        delegated_to_id: int,
        notes: Optional[str],
        current_user: User,
    ) -> LeadRead:
        lead = await self.lead_repo.get_by_id(lead_id)
        if not lead:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")

        is_supervisor = current_user.role in (UserRole.ADMIN, UserRole.SUB_ADMIN)
        if not is_supervisor and lead.assigned_to_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the lead owner or a supervisor can delegate this lead",
            )

        target_user = await self.db.get(User, delegated_to_id)
        if not target_user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target employee not found")

        lead.delegated_to_id = delegated_to_id
        lead.delegated_at = datetime.now(timezone.utc)
        lead.delegation_notes = notes.strip() if notes else None
        await self.lead_repo.update(lead)
        await self.db.commit()

        full_lead = await self.lead_repo.get_by_id(lead.id)
        return self._to_lead_read(full_lead, current_user.id)

    async def revoke_delegation(
        self,
        lead_id: int,
        current_user: User,
    ) -> LeadRead:
        lead = await self.lead_repo.get_by_id(lead_id)
        if not lead:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")

        is_supervisor = current_user.role in (UserRole.ADMIN, UserRole.SUB_ADMIN)
        is_owner = lead.assigned_to_id == current_user.id
        is_delegated = lead.delegated_to_id == current_user.id

        if not is_supervisor and not is_owner and not is_delegated:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to revoke delegation for this lead",
            )

        lead.delegated_to_id = None
        lead.delegated_at = None
        lead.delegation_notes = None
        await self.lead_repo.update(lead)
        await self.db.commit()

        full_lead = await self.lead_repo.get_by_id(lead.id)
        return self._to_lead_read(full_lead, current_user.id)

    async def bulk_delegate(
        self,
        delegated_to_id: int,
        notes: Optional[str],
        lead_ids: Optional[List[int]],
        current_user: User,
    ) -> dict:
        is_supervisor = current_user.role in (UserRole.ADMIN, UserRole.SUB_ADMIN)

        target_user = await self.db.get(User, delegated_to_id)
        if not target_user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target employee not found")

        now = datetime.now(timezone.utc)
        note_str = notes.strip() if notes else None

        if lead_ids:
            stmt = select(Lead).where(Lead.id.in_(lead_ids), Lead.is_active == True)
            if not is_supervisor:
                stmt = stmt.where(Lead.assigned_to_id == current_user.id)
        else:
            stmt = select(Lead).where(Lead.assigned_to_id == current_user.id, Lead.is_active == True)

        res = await self.db.execute(stmt)
        leads = res.scalars().all()
        count = 0
        for l in leads:
            l.delegated_to_id = delegated_to_id
            l.delegated_at = now
            l.delegation_notes = note_str
            count += 1

        await self.db.commit()
        return {
            "success": True,
            "delegated_count": count,
            "delegated_to_name": target_user.full_name,
        }

    async def bulk_revoke_delegation(
        self,
        lead_ids: Optional[List[int]],
        current_user: User,
    ) -> dict:
        is_supervisor = current_user.role in (UserRole.ADMIN, UserRole.SUB_ADMIN)

        if lead_ids:
            stmt = select(Lead).where(Lead.id.in_(lead_ids))
            if not is_supervisor:
                stmt = stmt.where(
                    or_(Lead.assigned_to_id == current_user.id, Lead.delegated_to_id == current_user.id)
                )
        else:
            stmt = select(Lead).where(Lead.assigned_to_id == current_user.id, Lead.delegated_to_id.isnot(None))

        res = await self.db.execute(stmt)
        leads = res.scalars().all()
        count = 0
        for l in leads:
            l.delegated_to_id = None
            l.delegated_at = None
            l.delegation_notes = None
            count += 1

        await self.db.commit()
        return {
            "success": True,
            "revoked_count": count,
        }

    async def get_call_logs(self, lead_id: int, current_user: User) -> List[LeadCallLogRead]:
        lead = await self.lead_repo.get_by_id(lead_id)
        if not lead:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")

        is_supervisor = current_user.role in (UserRole.ADMIN, UserRole.SUB_ADMIN)
        is_owner = lead.assigned_to_id == current_user.id
        is_delegated = lead.delegated_to_id == current_user.id
        if not is_supervisor and not is_owner and not is_delegated:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to view remarks for this lead",
            )

        lead_read = self._to_lead_read(lead, current_user.id)
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

    async def get_shareable_colleagues(
        self,
        current_user: User,
        lead_id: Optional[int] = None,
    ) -> List[UserRead]:
        """
        Get colleagues eligible for sharing/delegating calling workflow leads.
        For sales executives / TL / CO: restricts strictly to members of their own group/team.
        """
        from sqlalchemy.orm import selectinload
        from sqlalchemy import or_

        is_admin = current_user.role in (UserRole.ADMIN, UserRole.SUB_ADMIN)

        target_team_id = current_user.team_id
        manager_id = current_user.reporting_manager_id

        if is_admin:
            if lead_id:
                lead = await self.lead_repo.get_by_id(lead_id)
                if lead and lead.assigned_to_id:
                    owner = await self.db.get(User, lead.assigned_to_id)
                    if owner and owner.team_id:
                        target_team_id = owner.team_id
                        manager_id = owner.reporting_manager_id
            else:
                # Superuser listing: return all active employees & leaders
                stmt = (
                    select(User)
                    .options(selectinload(User.team), selectinload(User.reporting_manager))
                    .where(User.is_active == True)
                    .order_by(User.full_name)
                )
                res = await self.db.execute(stmt)
                users = res.scalars().all()
                return [UserRead.model_validate(u) for u in users]

        # Regular sales employee / TL / CO:
        # Group members = same team OR same manager OR direct manager OR subordinates
        group_conditions = []
        if target_team_id is not None:
            group_conditions.append(User.team_id == target_team_id)
        if manager_id is not None:
            group_conditions.append(User.id == manager_id)
            group_conditions.append(User.reporting_manager_id == manager_id)
        # Subordinates if current_user is a TL/manager
        group_conditions.append(User.reporting_manager_id == current_user.id)

        if group_conditions:
            stmt = (
                select(User)
                .options(selectinload(User.team), selectinload(User.reporting_manager))
                .where(
                    User.is_active == True,
                    User.id != current_user.id,
                    or_(*group_conditions),
                )
                .order_by(User.role, User.full_name)
            )
            res = await self.db.execute(stmt)
            users = res.scalars().all()
            if users:
                seen_ids = set()
                result: List[UserRead] = []
                for u in users:
                    if u.id not in seen_ids and u.id != current_user.id:
                        seen_ids.add(u.id)
                        result.append(UserRead.model_validate(u))
                return result

        # Fallback if employee is not assigned to a team or group yet:
        # Return other active sales employees/leaders so the dropdown is not permanently empty
        stmt = (
            select(User)
            .options(selectinload(User.team), selectinload(User.reporting_manager))
            .where(
                User.is_active == True,
                User.id != current_user.id,
            )
            .order_by(User.full_name)
        )
        res = await self.db.execute(stmt)
        users = res.scalars().all()
        seen_ids = set()
        result_fallback: List[UserRead] = []
        for u in users:
            if u.id not in seen_ids and u.id != current_user.id:
                seen_ids.add(u.id)
                result_fallback.append(UserRead.model_validate(u))
        return result_fallback
