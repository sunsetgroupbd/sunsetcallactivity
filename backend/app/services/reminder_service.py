"""Reminder and Notification Service."""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from urllib.parse import quote_plus

from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.call_activity import CallActivityEntry
from app.models.report import DailyActivityReport, ReportStatus
from app.models.sales_collection import SalesCollectionEntry
from app.models.user import User, UserRole
from app.schemas.reminders import ReminderItem, ReminderSummary, RemindersResponse


def get_dhaka_now() -> datetime:
    # Dhaka is UTC+6
    return datetime.now(timezone.utc) + timedelta(hours=6)


class ReminderService:
    def __init__(self, db: AsyncSession):
        self.db = db

    @staticmethod
    def _normalize_category(cat: str) -> str:
        s = cat.lower().strip()
        if "high" in s:
            return "high_potential"
        if "potential" in s:
            return "potential"
        if "facebook" in s:
            return "facebook"
        if "fair" in s:
            return "fair_leads"
        if "follow" in s or "fub" in s:
            return "follow_up"
        if "other" in s or "not" in s or "reached" in s:
            return "other_not_reached"
        if "cold" in s or "new" in s:
            return "new_cold_leads"
        return s.replace(" ", "_").replace("&", "_")

    async def _get_admin_executive_reminders(
        self,
        current_user: User,
        dhaka_now: datetime,
    ) -> RemindersResponse:
        """High-level management alerts for Admin/Sub-Admin across all employees."""
        today = dhaka_now.date()
        today_str = str(today)
        hour = dhaka_now.hour

        reminders: List[ReminderItem] = []
        follow_ups_today_count = 0
        overdue_count = 0
        unsubmitted_report = False

        # 1. Unsubmitted daily reports across active employees (Executives, TLs, COs)
        emp_query = await self.db.execute(
            select(User).where(
                User.is_active == True,
                User.role.in_([UserRole.EMPLOYEE, UserRole.TL, UserRole.CO]),
            ).order_by(User.full_name.asc())
        )
        active_employees = emp_query.scalars().all()
        active_emp_ids = [e.id for e in active_employees]

        if active_emp_ids:
            submitted_rep_q = await self.db.execute(
                select(DailyActivityReport.employee_id).where(
                    DailyActivityReport.employee_id.in_(active_emp_ids),
                    DailyActivityReport.report_date == today,
                    DailyActivityReport.status == ReportStatus.SUBMITTED,
                )
            )
            submitted_emp_ids = set(submitted_rep_q.scalars().all())
            unsubmitted_emps = [e for e in active_employees if e.id not in submitted_emp_ids]

            if unsubmitted_emps:
                unsubmitted_report = True
                is_evening = hour >= 17
                names_preview = ", ".join(e.full_name or e.username for e in unsubmitted_emps[:3])
                more_count = len(unsubmitted_emps) - 3
                if more_count > 0:
                    names_preview += f" +{more_count} more"

                reminders.append(
                    ReminderItem(
                        id=f"admin-unsubmitted-{today_str}",
                        type="report_submission",
                        severity="urgent" if is_evening else "warning",
                        title=f"Unsubmitted Daily Reports ({len(unsubmitted_emps)} Employees)" if is_evening else f"Daily Reports Pending ({len(unsubmitted_emps)} Employees)",
                        message=f"Pending: {names_preview}. Please monitor team submission.",
                        date=today_str,
                        link="/reports?status=draft",
                        action_label="Review Reports",
                    )
                )

        # 2. Payments Promised Today Across Team
        promised_today_q = await self.db.execute(
            select(SalesCollectionEntry, DailyActivityReport)
            .join(DailyActivityReport, SalesCollectionEntry.report_id == DailyActivityReport.id)
            .where(
                SalesCollectionEntry.expected_payment_date == today,
                SalesCollectionEntry.amount.isnot(None),
            )
        )
        promised_today_items = promised_today_q.all()
        if promised_today_items:
            tot_today_amt = sum(entry.amount or 0 for entry, _ in promised_today_items)
            reminders.append(
                ReminderItem(
                    id=f"admin-commit-today-{today_str}",
                    type="commitment_due_today",
                    severity="urgent",
                    title=f"Team Collections Expected Today: ৳{tot_today_amt:,.0f}",
                    message=f"{len(promised_today_items)} customer promise(s) scheduled for collection today across team.",
                    date=today_str,
                    link="/sales?tab=pipeline&filter=due_today",
                    action_label="View Today's Expected",
                )
            )

        # 3. Overdue Commitments Across Team
        overdue_q = await self.db.execute(
            select(SalesCollectionEntry, DailyActivityReport)
            .join(DailyActivityReport, SalesCollectionEntry.report_id == DailyActivityReport.id)
            .where(
                SalesCollectionEntry.expected_payment_date < today,
                SalesCollectionEntry.expected_payment_date >= today - timedelta(days=30),
                SalesCollectionEntry.amount.isnot(None),
            )
        )
        overdue_items = overdue_q.all()
        if overdue_items:
            overdue_count = len(overdue_items)
            tot_overdue_amt = sum(entry.amount or 0 for entry, _ in overdue_items)
            reminders.append(
                ReminderItem(
                    id=f"admin-commit-overdue-{today_str}",
                    type="commitment_overdue",
                    severity="warning",
                    title=f"Team Overdue Commitments: ৳{tot_overdue_amt:,.0f}",
                    message=f"{overdue_count} customer payment promise(s) are overdue across team. Follow-up needed.",
                    date=today_str,
                    link="/sales?tab=pipeline&filter=overdue",
                    action_label="Inspect Overdue Pipeline",
                )
            )

        # 4. Commitments Missing Promised Dates (Last 7 Days)
        no_date_q = await self.db.execute(
            select(SalesCollectionEntry, DailyActivityReport)
            .join(DailyActivityReport, SalesCollectionEntry.report_id == DailyActivityReport.id)
            .where(
                SalesCollectionEntry.expected_payment_date.is_(None),
                SalesCollectionEntry.category.like("%commit%"),
                DailyActivityReport.report_date >= (today - timedelta(days=7)),
                SalesCollectionEntry.amount.isnot(None),
            )
        )
        no_date_items = no_date_q.all()
        if no_date_items:
            tot_no_date_amt = sum(entry.amount or 0 for entry, _ in no_date_items)
            reminders.append(
                ReminderItem(
                    id=f"admin-commit-nodate-{today_str}",
                    type="commitment_due",
                    severity="info",
                    title=f"{len(no_date_items)} Commitments Missing Promised Dates",
                    message=f"৳{tot_no_date_amt:,.0f} in recent commitments recorded without promised dates set by employees.",
                    date=today_str,
                    link="/sales?tab=pipeline&filter=all",
                    action_label="Review Pipeline",
                )
            )

        # 5. Client Follow-ups Due Today Across Team
        thirty_days_ago = today - timedelta(days=30)
        recent_rep_q = await self.db.execute(
            select(DailyActivityReport)
            .where(
                DailyActivityReport.report_date >= thirty_days_ago,
                DailyActivityReport.notes.isnot(None),
            )
            .order_by(DailyActivityReport.report_date.desc())
        )
        recent_reports = recent_rep_q.scalars().all()
        seen_clients = set()
        for rep in recent_reports:
            if not rep.notes:
                continue
            try:
                data = json.loads(rep.notes)
                contacts = data.get("client_contacts", [])
                if not isinstance(contacts, list):
                    continue
                for c in contacts:
                    c_name = c.get("client_name", "").strip()
                    fu_date = c.get("follow_up_date", "").strip()
                    if not c_name or not fu_date:
                        continue
                    if c_name.lower() in seen_clients:
                        continue
                    seen_clients.add(c_name.lower())
                    if fu_date == today_str:
                        follow_ups_today_count += 1
            except Exception:
                continue

        if follow_ups_today_count > 0:
            reminders.append(
                ReminderItem(
                    id=f"admin-fu-today-{today_str}",
                    type="follow_up_today",
                    severity="info",
                    title=f"{follow_ups_today_count} Client Follow-ups Scheduled Today",
                    message=f"{follow_ups_today_count} client calls scheduled across sales representatives today.",
                    date=today_str,
                    link="/reports",
                    action_label="View Reports",
                )
            )

        # 6. Check Active Staff Lead Pipelines On Risk (HP < 50, P < 150, FUB < 500)
        if active_emp_ids:
            risk_entries_q = await self.db.execute(
                select(CallActivityEntry, DailyActivityReport, User)
                .join(DailyActivityReport, CallActivityEntry.report_id == DailyActivityReport.id)
                .join(User, DailyActivityReport.employee_id == User.id)
                .where(
                    DailyActivityReport.employee_id.in_(active_emp_ids),
                    DailyActivityReport.report_date >= (today - timedelta(days=2)),
                )
            )
            risk_user_map: dict[str, list[str]] = {}
            for centry, crep, cuser in risk_entries_q.all():
                cat_n = self._normalize_category(centry.lead_category)
                st = centry.till_today_status if centry.till_today_status is not None else 0
                r_tag = None
                if cat_n == "high_potential" and st < 50:
                    r_tag = f"HP: {st} (<50)"
                elif cat_n == "potential" and st < 150:
                    r_tag = f"P: {st} (<150)"
                elif cat_n == "follow_up" and st < 500:
                    r_tag = f"FUB: {st} (<500)"

                if r_tag:
                    uname = cuser.full_name or cuser.username
                    if uname not in risk_user_map:
                        risk_user_map[uname] = []
                    if r_tag not in risk_user_map[uname]:
                        risk_user_map[uname].append(r_tag)

            if risk_user_map:
                names_summary = "; ".join(
                    f"{uname} ({', '.join(tags)})" for uname, tags in list(risk_user_map.items())[:3]
                )
                extra = len(risk_user_map) - 3
                if extra > 0:
                    names_summary += f" +{extra} more"
                reminders.append(
                    ReminderItem(
                        id=f"admin-lead-risk-{today_str}",
                        type="lead_pipeline_risk",
                        severity="warning",
                        title=f"{len(risk_user_map)} Staff Lead Pipelines On Risk",
                        message=f"Starting leads below threshold: {names_summary}.",
                        date=today_str,
                        link="/reports",
                        action_label="Review Reports",
                    )
                )

        # 6b. Check Staff Dialing Red Flags (< 150 calls today)
        if active_emp_ids:
            today_reps_q = await self.db.execute(
                select(DailyActivityReport)
                .options(
                    selectinload(DailyActivityReport.call_entries),
                    selectinload(DailyActivityReport.employee),
                )
                .where(
                    DailyActivityReport.employee_id.in_(active_emp_ids),
                    DailyActivityReport.report_date == today,
                )
            )
            red_flagged_staff: list[str] = []
            for rep in today_reps_q.scalars().all():
                r_dialed = 0
                for ce in rep.call_entries:
                    slot1 = ce.slot_10am_1pm or 0
                    slot2 = ce.slot_2pm_5pm or 0
                    slot3 = ce.slot_5pm_6pm or 0
                    ce_hp = ce.lead_status_hp or 0
                    ce_p = ce.lead_status_p or 0
                    ce_fub = ce.lead_status_fub or 0
                    ce_ni = ce.lead_status_ni or 0
                    outcomes_conn = ce_hp + ce_p + ce_fub + ce_ni
                    ce_conn = ce.total_connected if (ce.total_connected is not None and ce.total_connected >= outcomes_conn) else outcomes_conn
                    r_dialed += max(ce.total_dialed if ce.total_dialed is not None else (slot1 + slot2 + slot3), ce_conn)
                if r_dialed < 150 and rep.call_entries:
                    uname = rep.employee.full_name or rep.employee.username if rep.employee else str(rep.employee_id)
                    red_flagged_staff.append(f"{uname} ({r_dialed})")

            if red_flagged_staff:
                summary_names = ", ".join(red_flagged_staff[:3])
                if len(red_flagged_staff) > 3:
                    summary_names += f" +{len(red_flagged_staff) - 3} more"
                reminders.append(
                    ReminderItem(
                        id=f"admin-red-flag-dial-{today_str}",
                        type="dialing_red_flag",
                        severity="urgent" if hour >= 16 else "warning",
                        title=f"🚩 {len(red_flagged_staff)} Staff Dialing Red Flags (< 150 Calls)",
                        message=f"Staff with less than 150 dials today: {summary_names}.",
                        date=today_str,
                        link="/reports",
                        action_label="Review Reports",
                    )
                )

        # 7. Call Slot Mid-Day Nudge
        slot_nudge_text = None
        if 10 <= hour < 13:
            slot_nudge_text = "Slot 1 (10 AM – 1 PM)"
        elif 13 <= hour < 14:
            slot_nudge_text = "Slot 1 Ended"
        elif 14 <= hour < 17:
            slot_nudge_text = "Slot 2 (2 PM – 5 PM)"
        elif 17 <= hour < 18:
            slot_nudge_text = "Slot 3 (5 PM – 6 PM)"
        elif hour >= 18:
            slot_nudge_text = "End of Day"

        summary = ReminderSummary(
            total_count=len(reminders),
            follow_ups_today_count=follow_ups_today_count,
            overdue_count=overdue_count,
            unsubmitted_report=unsubmitted_report,
            slot_nudge=slot_nudge_text,
        )

        return RemindersResponse(summary=summary, reminders=reminders)

    async def get_reminders(
        self,
        current_user: User,
        target_employee_id: Optional[int] = None,
    ) -> RemindersResponse:
        # Determine employee id: if employee, always their own; if admin, either target or own
        emp_id = current_user.id
        if current_user.role in (UserRole.ADMIN, UserRole.SUB_ADMIN) and target_employee_id:
            emp_id = target_employee_id

        dhaka_now = get_dhaka_now()
        is_admin_all = current_user.role in (UserRole.ADMIN, UserRole.SUB_ADMIN) and not target_employee_id
        if is_admin_all:
            return await self._get_admin_executive_reminders(current_user, dhaka_now)

        today = dhaka_now.date()
        today_str = str(today)
        hour = dhaka_now.hour

        reminders: List[ReminderItem] = []
        follow_ups_today_count = 0
        overdue_count = 0
        unsubmitted_report = False

        # ── 1. Check Today's Report Status ────────────────────────────────────
        rep_query = await self.db.execute(
            select(DailyActivityReport).where(
                DailyActivityReport.employee_id == emp_id,
                DailyActivityReport.report_date == today,
            )
        )
        today_report = rep_query.scalar_one_or_none()

        if not today_report or today_report.status != ReportStatus.SUBMITTED:
            unsubmitted_report = True
            is_evening = hour >= 17
            reminders.append(
                ReminderItem(
                    id=f"rep-unsubmitted-{today_str}",
                    type="report_submission",
                    severity="urgent" if is_evening else "warning",
                    title="Daily Report Not Submitted" if is_evening else "Daily Report Pending",
                    message="Today's report is pending submission.",
                    date=today_str,
                    link=f"/calls?date={today_str}&employee_id={emp_id}",
                    action_label="Submit",
                )
            )

        # ── 1b. Check Starting Leads On Risk (HP < 50, P < 150, FUB < 500) ────
        target_rep = today_report
        if not target_rep:
            latest_rep_q = await self.db.execute(
                select(DailyActivityReport)
                .where(
                    DailyActivityReport.employee_id == emp_id,
                    DailyActivityReport.report_date <= today,
                )
                .order_by(DailyActivityReport.report_date.desc())
                .limit(1)
            )
            target_rep = latest_rep_q.scalar_one_or_none()

        if target_rep:
            call_entries_q = await self.db.execute(
                select(CallActivityEntry).where(CallActivityEntry.report_id == target_rep.id)
            )
            call_entries = list(call_entries_q.scalars().all())
            for ce in call_entries:
                norm_cat = self._normalize_category(ce.lead_category)
                start_leads = ce.till_today_status if ce.till_today_status is not None else 0

                if norm_cat == "high_potential" and start_leads < 50:
                    reminders.append(
                        ReminderItem(
                            id=f"risk-lead-hp-{target_rep.id}",
                            type="lead_pipeline_risk",
                            severity="urgent",
                            title=f"High Potential Leads On Risk ({start_leads} < 50)",
                            message=f"Your High Potential starting leads ({start_leads}) is below the required 50. Replenish your high potential pipeline.",
                            category="High Potential",
                            date=today_str,
                            link=f"/calls?date={target_rep.report_date}&employee_id={emp_id}",
                            action_label="Update Calls",
                        )
                    )
                elif norm_cat == "potential" and start_leads < 150:
                    reminders.append(
                        ReminderItem(
                            id=f"risk-lead-p-{target_rep.id}",
                            type="lead_pipeline_risk",
                            severity="warning",
                            title=f"Potential Leads On Risk ({start_leads} < 150)",
                            message=f"Your Potential starting leads ({start_leads}) is below the required 150. Replenish your potential pipeline.",
                            category="Potential",
                            date=today_str,
                            link=f"/calls?date={target_rep.report_date}&employee_id={emp_id}",
                            action_label="Update Calls",
                        )
                    )
                elif norm_cat == "follow_up" and start_leads < 500:
                    reminders.append(
                        ReminderItem(
                            id=f"risk-lead-fub-{target_rep.id}",
                            type="lead_pipeline_risk",
                            severity="warning",
                            title=f"Follow Up Leads On Risk ({start_leads} < 500)",
                            message=f"Your Follow Up starting leads ({start_leads}) is below the required 500. Replenish your follow-up pipeline.",
                            category="Follow Up",
                            date=today_str,
                            link=f"/calls?date={target_rep.report_date}&employee_id={emp_id}",
                            action_label="Update Calls",
                        )
                    )

            # Check Dialing Red Flag (< 150 calls per day)
            tot_rep_dialed = 0
            for ce in call_entries:
                slot1 = ce.slot_10am_1pm or 0
                slot2 = ce.slot_2pm_5pm or 0
                slot3 = ce.slot_5pm_6pm or 0
                ce_hp = ce.lead_status_hp or 0
                ce_p = ce.lead_status_p or 0
                ce_fub = ce.lead_status_fub or 0
                ce_ni = ce.lead_status_ni or 0
                outcomes_conn = ce_hp + ce_p + ce_fub + ce_ni
                ce_conn = ce.total_connected if (ce.total_connected is not None and ce.total_connected >= outcomes_conn) else outcomes_conn
                tot_rep_dialed += max(ce.total_dialed if ce.total_dialed is not None else (slot1 + slot2 + slot3), ce_conn)

            if call_entries and tot_rep_dialed < 150:
                is_urgent_dial = hour >= 16 or target_rep.status == ReportStatus.SUBMITTED
                reminders.append(
                    ReminderItem(
                        id=f"red-flag-dial-{target_rep.id}",
                        type="dialing_red_flag",
                        severity="urgent" if is_urgent_dial else "warning",
                        title=f"🚩 Dialing Red Flag: {tot_rep_dialed} Calls (< 150)",
                        message=f"You have dialed {tot_rep_dialed} calls for {target_rep.report_date}. Daily required minimum is 150 calls (deficit: {150 - tot_rep_dialed}).",
                        date=str(target_rep.report_date),
                        link=f"/calls?date={target_rep.report_date}&employee_id={emp_id}",
                        action_label="Make Calls / Update",
                    )
                )

        # ── 2. Check Client Follow-Ups in Recent Reports (Last 30 Days) ──────
        thirty_days_ago = today - timedelta(days=30)
        recent_reports_q = await self.db.execute(
            select(DailyActivityReport)
            .where(
                DailyActivityReport.employee_id == emp_id,
                DailyActivityReport.report_date >= thirty_days_ago,
                DailyActivityReport.notes.isnot(None),
            )
            .order_by(DailyActivityReport.report_date.desc())
        )
        recent_reports = recent_reports_q.scalars().all()

        seen_clients = set()

        for rep in recent_reports:
            if not rep.notes:
                continue
            try:
                data = json.loads(rep.notes)
                contacts = data.get("client_contacts", [])
                if not isinstance(contacts, list):
                    continue

                for idx, c in enumerate(contacts):
                    client_name = c.get("client_name", "").strip()
                    follow_up_date = c.get("follow_up_date", "").strip()
                    if not client_name or not follow_up_date:
                        continue

                    # Avoid duplicate reminders for the same client name
                    if client_name.lower() in seen_clients:
                        continue
                    seen_clients.add(client_name.lower())

                    phone = c.get("phone_number", "")
                    category = c.get("category", "HP")
                    notes = c.get("discussion_notes", "")

                    if follow_up_date == today_str:
                        follow_ups_today_count += 1
                        reminders.append(
                            ReminderItem(
                                id=f"fu-today-{rep.id}-{idx}",
                                type="follow_up_today",
                                severity="urgent",
                                title=f"Follow-up Today: {client_name}",
                                message=f"Priority: {category} | Phone: {phone or 'N/A'}" + (f" | {notes}" if notes else ""),
                                client_name=client_name,
                                phone_number=phone,
                                category=category,
                                date=today_str,
                                link=f"/calls?date={rep.report_date}&employee_id={emp_id}",
                                action_label="View / Call",
                            )
                        )
                    elif follow_up_date < today_str and follow_up_date >= str(today - timedelta(days=14)):
                        overdue_count += 1
                        reminders.append(
                            ReminderItem(
                                id=f"fu-overdue-{rep.id}-{idx}",
                                type="follow_up_overdue",
                                severity="warning",
                                title=f"Overdue Follow-up: {client_name}",
                                message=f"Scheduled for {follow_up_date} ({category}) | Phone: {phone or 'N/A'}",
                                client_name=client_name,
                                phone_number=phone,
                                category=category,
                                date=follow_up_date,
                                link=f"/calls?date={rep.report_date}&employee_id={emp_id}",
                                action_label="Follow-up Now",
                            )
                        )
            except Exception:
                continue

        # ── 3. Check Promised Payment Commitments for this Employee ───────────
        comm_filters = [
            DailyActivityReport.employee_id == emp_id,
            SalesCollectionEntry.expected_payment_date.isnot(None),
            SalesCollectionEntry.expected_payment_date <= today + timedelta(days=2),
            SalesCollectionEntry.expected_payment_date >= today - timedelta(days=30),
        ]

        comm_query = (
            select(SalesCollectionEntry, DailyActivityReport, User)
            .join(DailyActivityReport, SalesCollectionEntry.report_id == DailyActivityReport.id)
            .join(User, DailyActivityReport.employee_id == User.id)
            .where(*comm_filters)
            .order_by(SalesCollectionEntry.expected_payment_date.asc())
            .limit(15)
        )
        comm_res = await self.db.execute(comm_query)
        promised_items = comm_res.all()

        for entry, rep, emp_user in promised_items:
            if not entry.customer_name or not entry.amount or not entry.expected_payment_date:
                continue

            exp_date = entry.expected_payment_date
            exp_date_str = str(exp_date)
            cat_label = entry.category.replace("_", " ").title()
            proj_str = f" ({entry.project_name})" if entry.project_name else ""

            if exp_date == today:
                reminders.append(
                    ReminderItem(
                        id=f"commit-today-{entry.id}",
                        type="commitment_due_today",
                        severity="urgent",
                        title=f"Payment Promised Today: {entry.customer_name}",
                        message=f"৳{entry.amount:,.0f} ({cat_label}){proj_str} promised today by {entry.customer_name}. Follow up for collection.",
                        client_name=entry.customer_name,
                        category=cat_label,
                        date=exp_date_str,
                        link=f"/sales?employee_id={emp_id}&tab=pipeline&search={quote_plus(entry.customer_name)}&edit_id={entry.id}",
                        action_label="Collect / Reschedule",
                    )
                )
            elif exp_date < today:
                overdue_days = (today - exp_date).days
                overdue_count += 1
                reminders.append(
                    ReminderItem(
                        id=f"commit-overdue-{entry.id}",
                        type="commitment_overdue",
                        severity="warning",
                        title=f"Overdue Promise: {entry.customer_name}",
                        message=f"৳{entry.amount:,.0f} was promised on {exp_date_str} ({overdue_days}d overdue) by {entry.customer_name}. Reschedule or follow up.",
                        client_name=entry.customer_name,
                        category=cat_label,
                        date=exp_date_str,
                        link=f"/sales?employee_id={emp_id}&tab=pipeline&search={quote_plus(entry.customer_name)}&edit_id={entry.id}",
                        action_label="Review in Pipeline",
                    )
                )
            elif exp_date == today + timedelta(days=1):
                reminders.append(
                    ReminderItem(
                        id=f"commit-tomorrow-{entry.id}",
                        type="commitment_due",
                        severity="info",
                        title=f"Payment Due Tomorrow: {entry.customer_name}",
                        message=f"৳{entry.amount:,.0f} ({cat_label}){proj_str} promised for tomorrow by {entry.customer_name}.",
                        client_name=entry.customer_name,
                        category=cat_label,
                        date=exp_date_str,
                        link=f"/sales?employee_id={emp_id}&tab=pipeline&search={quote_plus(entry.customer_name)}&edit_id={entry.id}",
                        action_label="View in Sales",
                    )
                )

        # Also include recent commitments (last 7 days) without an expected date for this employee
        no_date_filters = [
            DailyActivityReport.employee_id == emp_id,
            SalesCollectionEntry.expected_payment_date.is_(None),
            SalesCollectionEntry.category.like("%commit%"),
            DailyActivityReport.report_date >= (today - timedelta(days=7)),
        ]

        no_date_q = await self.db.execute(
            select(SalesCollectionEntry, User)
            .join(DailyActivityReport, SalesCollectionEntry.report_id == DailyActivityReport.id)
            .join(User, DailyActivityReport.employee_id == User.id)
            .where(*no_date_filters)
            .order_by(SalesCollectionEntry.id.desc())
            .limit(5)
        )
        for comm, emp_user in no_date_q.all():
            if comm.customer_name and comm.amount:
                cat_label = comm.category.replace("_", " ").title()
                reminders.append(
                    ReminderItem(
                        id=f"commit-{comm.id}",
                        type="commitment_due",
                        severity="info",
                        title=f"Commitment: {comm.customer_name}",
                        message=f"{cat_label} of ৳{comm.amount:,.0f} recorded. Set promised date in Sales.",
                        client_name=comm.customer_name,
                        category=cat_label,
                        link=f"/sales?employee_id={emp_id}&tab=pipeline&search={quote_plus(comm.customer_name)}&edit_id={comm.id}",
                        action_label="Set Date",
                    )
                )

        # ── 4. Call Slot Mid-Day Nudge ────────────────────────────────────────
        slot_nudge_text = None
        if 10 <= hour < 13:
            slot_nudge_text = "Slot 1 (10 AM – 1 PM)"
        elif 13 <= hour < 14:
            slot_nudge_text = "Slot 1 Ended"
        elif 14 <= hour < 17:
            slot_nudge_text = "Slot 2 (2 PM – 5 PM)"
        elif 17 <= hour < 18:
            slot_nudge_text = "Slot 3 (5 PM – 6 PM)"
        elif hour >= 18:
            slot_nudge_text = "End of Day"

        summary = ReminderSummary(
            total_count=len(reminders),
            follow_ups_today_count=follow_ups_today_count,
            overdue_count=overdue_count,
            unsubmitted_report=unsubmitted_report,
            slot_nudge=slot_nudge_text,
        )

        return RemindersResponse(summary=summary, reminders=reminders)
