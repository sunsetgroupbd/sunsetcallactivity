"""OutdoorVisitService — business logic for outdoor visits and real estate fair logs."""
from __future__ import annotations

import logging
import re
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Sequence
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.outdoor_visit import OutdoorVisitLog
from app.models.report import DailyActivityReport, ReportStatus
from app.models.user import User, UserRole
from app.repositories.outdoor_visit_repo import OutdoorVisitRepository
from app.repositories.report_repo import ReportRepository
from app.repositories.meeting_repo import MeetingActivityRepository
from app.schemas.outdoor_visit import (
    FairReturnPayload,
    FairStartPayload,
    OutdoorVisitCreate,
    OutdoorVisitRead,
)

logger = logging.getLogger(__name__)
DHAKA_TZ = ZoneInfo("Asia/Dhaka")


def get_dhaka_today() -> date:
    return datetime.now(DHAKA_TZ).date()


def get_dhaka_time_str() -> str:
    return datetime.now(DHAKA_TZ).strftime("%I:%M %p")


def parse_time_to_minutes(time_str: str | None) -> Optional[int]:
    if not time_str:
        return None
    cleaned = time_str.strip().upper()
    m = re.match(r"^(\d{1,2}):(\d{2})\s*(AM|PM)?$", cleaned)
    if not m:
        return None
    hours = int(m.group(1))
    minutes = int(m.group(2))
    ampm = m.group(3)
    if ampm == "PM" and hours < 12:
        hours += 12
    elif ampm == "AM" and hours == 12:
        hours = 0
    return hours * 60 + minutes


def calc_duration_minutes(start_str: str | None, end_str: str | None) -> int:
    m1 = parse_time_to_minutes(start_str)
    m2 = parse_time_to_minutes(end_str)
    if m1 is not None and m2 is not None:
        if m2 >= m1:
            return m2 - m1
        else:
            return (24 * 60 - m1) + m2
    return 0


class OutdoorVisitService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.repo = OutdoorVisitRepository(db)
        self.report_repo = ReportRepository(db)
        self.meeting_repo = MeetingActivityRepository(db)

    async def get_logs(
        self,
        visit_date: date,
        employee_id: Optional[int],
        current_user: User,
    ) -> List[OutdoorVisitRead]:
        is_admin = current_user.role in (UserRole.ADMIN, UserRole.SUB_ADMIN)
        target_emp_id = employee_id if is_admin and employee_id else current_user.id

        if is_admin and not employee_id:
            raw_logs = await self.repo.get_by_date(visit_date)
        else:
            raw_logs = await self.repo.get_by_date_and_employee(visit_date, target_emp_id)

        items = []
        for log in raw_logs:
            emp_name = log.employee.full_name if log.employee else None
            items.append(
                OutdoorVisitRead(
                    id=log.id,
                    report_id=log.report_id,
                    employee_id=log.employee_id,
                    employee_name=emp_name,
                    visit_date=log.visit_date,
                    visit_type=log.visit_type,
                    title=log.title,
                    departure_time=log.departure_time,
                    return_time=log.return_time,
                    duration_minutes=log.duration_minutes,
                    status=log.status,
                    is_present=log.is_present,
                    notes=log.notes,
                    created_at=log.created_at,
                )
            )
        return items

    async def get_active_fair(
        self,
        visit_date: date,
        employee_id: Optional[int],
        current_user: User,
    ) -> Optional[OutdoorVisitRead]:
        is_admin = current_user.role in (UserRole.ADMIN, UserRole.SUB_ADMIN)
        target_emp_id = employee_id if is_admin and employee_id else current_user.id

        log = await self.repo.get_active_fair_visit(visit_date, target_emp_id)
        if not log:
            return None
        emp_name = log.employee.full_name if log.employee else None
        return OutdoorVisitRead(
            id=log.id,
            report_id=log.report_id,
            employee_id=log.employee_id,
            employee_name=emp_name,
            visit_date=log.visit_date,
            visit_type=log.visit_type,
            title=log.title,
            departure_time=log.departure_time,
            return_time=log.return_time,
            duration_minutes=log.duration_minutes,
            status=log.status,
            is_present=log.is_present,
            notes=log.notes,
            created_at=log.created_at,
        )

    async def start_fair(
        self, payload: FairStartPayload, current_user: User
    ) -> OutdoorVisitRead:
        """Record departure to a real estate fair or stall."""
        is_admin = current_user.role in (UserRole.ADMIN, UserRole.SUB_ADMIN)
        target_emp_id = payload.employee_id if is_admin and payload.employee_id else current_user.id
        target_date = payload.visit_date or get_dhaka_today()

        # Check if already active
        existing = await self.repo.get_active_fair_visit(target_date, target_emp_id)
        if existing:
            raise HTTPException(
                status_code=400,
                detail=f"Employee is already recorded on active Fair duty (departed at {existing.departure_time}).",
            )

        report = await self.report_repo.get_or_create(target_emp_id, target_date)
        departure_time = payload.departure_time or get_dhaka_time_str()

        create_data: Dict[str, Any] = {
            "report_id": report.id,
            "employee_id": target_emp_id,
            "visit_date": target_date,
            "visit_type": "fair",
            "title": payload.title or "Fair Duty",
            "departure_time": departure_time,
            "return_time": None,
            "duration_minutes": 0,
            "status": "in_progress",
            "is_present": False,
            "notes": payload.notes,
        }
        log = await self.repo.create(create_data)
        emp_name = current_user.full_name

        # Increment report outdoor visit count by 1
        await self._sync_meeting_activity_totals(report.id)

        return OutdoorVisitRead(
            id=log.id,
            report_id=log.report_id,
            employee_id=log.employee_id,
            employee_name=emp_name,
            visit_date=log.visit_date,
            visit_type=log.visit_type,
            title=log.title,
            departure_time=log.departure_time,
            return_time=log.return_time,
            duration_minutes=log.duration_minutes,
            status=log.status,
            is_present=log.is_present,
            notes=log.notes,
            created_at=log.created_at,
        )

    async def return_fair(
        self, payload: FairReturnPayload, current_user: User
    ) -> OutdoorVisitRead:
        """Mark return from fair and set presence to Present."""
        log = None
        if payload.log_id:
            log = await self.repo.get_by_id(payload.log_id)
        else:
            # Find current user's active fair visit today
            log = await self.repo.get_active_fair_visit(get_dhaka_today(), current_user.id)

        if not log:
            raise HTTPException(
                status_code=404, detail="No active fair visit found to mark return."
            )

        is_admin = current_user.role in (UserRole.ADMIN, UserRole.SUB_ADMIN)
        if not is_admin and log.employee_id != current_user.id:
            raise HTTPException(status_code=403, detail="Cannot edit another employee's fair duty.")

        return_time = payload.return_time or get_dhaka_time_str()
        duration = calc_duration_minutes(log.departure_time, return_time)
        if duration == 0 and log.departure_time:
            duration = 60  # Default 1 hr minimum if instant press or unparsed

        notes = log.notes
        if payload.notes:
            notes = f"{notes}\n{payload.notes}".strip() if notes else payload.notes

        update_data: Dict[str, Any] = {
            "return_time": return_time,
            "duration_minutes": duration,
            "status": "completed",
            "is_present": True,
            "notes": notes,
        }
        updated = await self.repo.update(log, update_data)

        if updated.report_id:
            await self._sync_meeting_activity_totals(updated.report_id)

        emp_name = updated.employee.full_name if updated.employee else current_user.full_name
        return OutdoorVisitRead(
            id=updated.id,
            report_id=updated.report_id,
            employee_id=updated.employee_id,
            employee_name=emp_name,
            visit_date=updated.visit_date,
            visit_type=updated.visit_type,
            title=updated.title,
            departure_time=updated.departure_time,
            return_time=updated.return_time,
            duration_minutes=updated.duration_minutes,
            status=updated.status,
            is_present=updated.is_present,
            notes=updated.notes,
            created_at=updated.created_at,
        )

    async def create_log(
        self, payload: OutdoorVisitCreate, current_user: User
    ) -> OutdoorVisitRead:
        """Create manual or past outdoor/fair visit record."""
        is_admin = current_user.role in (UserRole.ADMIN, UserRole.SUB_ADMIN)
        target_emp_id = payload.employee_id if is_admin and payload.employee_id else current_user.id
        target_date = payload.visit_date or get_dhaka_today()

        report = await self.report_repo.get_or_create(target_emp_id, target_date)

        # Calculate duration if departure & return times are provided
        duration = payload.duration_minutes or 0
        if duration == 0 and payload.departure_time and payload.return_time:
            duration = calc_duration_minutes(payload.departure_time, payload.return_time)

        create_data: Dict[str, Any] = {
            "report_id": report.id,
            "employee_id": target_emp_id,
            "visit_date": target_date,
            "visit_type": payload.visit_type,
            "title": payload.title or ("Fair Visit" if payload.visit_type == "fair" else "Client Visit"),
            "departure_time": payload.departure_time,
            "return_time": payload.return_time,
            "duration_minutes": duration,
            "status": payload.status or "completed",
            "is_present": payload.is_present if payload.is_present is not None else True,
            "notes": payload.notes,
        }
        log = await self.repo.create(create_data)

        await self._sync_meeting_activity_totals(report.id)

        emp_name = current_user.full_name
        return OutdoorVisitRead(
            id=log.id,
            report_id=log.report_id,
            employee_id=log.employee_id,
            employee_name=emp_name,
            visit_date=log.visit_date,
            visit_type=log.visit_type,
            title=log.title,
            departure_time=log.departure_time,
            return_time=log.return_time,
            duration_minutes=log.duration_minutes,
            status=log.status,
            is_present=log.is_present,
            notes=log.notes,
            created_at=log.created_at,
        )

    async def delete_log(self, log_id: int, current_user: User) -> bool:
        log = await self.repo.get_by_id(log_id)
        if not log:
            return False
        is_admin = current_user.role in (UserRole.ADMIN, UserRole.SUB_ADMIN)
        if not is_admin and log.employee_id != current_user.id:
            raise HTTPException(status_code=403, detail="Cannot delete this record.")
        report_id = log.report_id
        res = await self.repo.delete(log_id)
        if report_id:
            await self._sync_meeting_activity_totals(report_id)
        return res

    async def _sync_meeting_activity_totals(self, report_id: int) -> None:
        """
        Aggregate all outdoor_visit_logs for this report and reflect in meeting_activity_entries
        so that daily report summaries, outdoor hours, and target credits stay 100% in sync.
        """
        try:
            report = await self.report_repo.get_by_id(report_id)
            if not report:
                return

            logs = await self.repo.get_by_date_and_employee(report.report_date, report.employee_id)
            completed_logs = [l for l in logs if l.status == "completed" or l.is_present]

            total_visits = len(completed_logs)
            total_minutes = sum(l.duration_minutes for l in completed_logs)

            # If there are completed logs, ensure meeting entries reflect at least these totals
            if total_visits > 0 or total_minutes > 0:
                current_entries = await self.meeting_repo.get_by_report(report_id)
                visit_entry = next((e for e in current_entries if e.activity_type == "outdoor_visit_count"), None)
                mins_entry = next((e for e in current_entries if e.activity_type == "outdoor_time_minutes"), None)

                # Determine slot bucket: default to afternoon or distributed
                new_entries = []
                # Slot 2pm-5pm is a common outdoor slot
                slot_key = "slot_2pm_5pm"

                existing_visit_cnt = max(visit_entry.slot_2pm_5pm or 0, total_visits) if visit_entry else total_visits
                existing_mins = max(mins_entry.slot_2pm_5pm or 0, total_minutes) if mins_entry else total_minutes

                new_entries.append({
                    "activity_type": "outdoor_visit_count",
                    "slot_10am_1pm": visit_entry.slot_10am_1pm if visit_entry else None,
                    "slot_2pm_5pm": existing_visit_cnt,
                    "slot_5pm_6pm": visit_entry.slot_5pm_6pm if visit_entry else None,
                    "total_count": existing_visit_cnt,
                })
                new_entries.append({
                    "activity_type": "outdoor_time_minutes",
                    "slot_10am_1pm": mins_entry.slot_10am_1pm if mins_entry else None,
                    "slot_2pm_5pm": existing_mins,
                    "slot_5pm_6pm": mins_entry.slot_5pm_6pm if mins_entry else None,
                    "total_duration_minutes": existing_mins,
                })
                await self.meeting_repo.upsert_entries(report_id, new_entries)
        except Exception as e:
            logger.warning("Error syncing outdoor visit totals to meeting entries: %s", e)
