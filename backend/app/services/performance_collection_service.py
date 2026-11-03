"""
Service for Employee Performance & Collection Report.
Aggregates Section 1 (Monthly Performance with checkpoint milestones)
and Section 2 (Customer-wise Collection Ledger).
"""
from __future__ import annotations

import calendar
import json
from datetime import date
from decimal import Decimal
from typing import List, Optional, Tuple, Dict, Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.report import DailyActivityReport, ReportStatus
from app.models.sales_collection import SalesCollectionEntry
from app.models.call_activity import CallActivityEntry
from app.models.meeting_activity import MeetingActivityEntry
from app.models.user import User, UserRole
from app.repositories.targets_repo import TargetsRepository
from app.schemas.performance_collection_report import (
    CustomerCollectionItem,
    EmployeeMonthlyPerformance,
    PerformanceCollectionReportResponse,
    PerformanceCollectionSummaryTotals,
    PerformanceIntervalSummary,
)


class PerformanceCollectionService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.targets_repo = TargetsRepository(db)

    async def get_report_data(
        self,
        current_user: User,
        month_str: Optional[str] = None,  # "YYYY-MM", e.g. "2026-11"
        employee_id: Optional[int] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        lead_status_filter: Optional[str] = None,
    ) -> PerformanceCollectionReportResponse:
        # 1. Determine date range
        today = date.today()
        if month_str and len(month_str) == 7 and "-" in month_str:
            try:
                year, month = map(int, month_str.split("-"))
            except ValueError:
                year, month = today.year, today.month
        elif date_from:
            year, month = date_from.year, date_from.month
        else:
            year, month = today.year, today.month

        num_days = calendar.monthrange(year, month)[1]
        calc_start = date(year, month, 1)
        calc_end = date(year, month, num_days)

        active_start = date_from if date_from else calc_start
        active_end = date_to if date_to else calc_end
        month_display = f"{calendar.month_name[month]} {year}"

        # 2. Determine target employees
        is_admin_or_supervisor = current_user.role in [
            UserRole.ADMIN,
            UserRole.SUB_ADMIN,
            UserRole.TL,
            UserRole.CO,
        ]

        user_query = select(User).where(User.is_active.is_(True))
        if not is_admin_or_supervisor:
            user_query = user_query.where(User.id == current_user.id)
        elif employee_id:
            user_query = user_query.where(User.id == employee_id)
        else:
            user_query = user_query.where(
                User.role.in_([UserRole.EMPLOYEE, UserRole.TL, UserRole.CO])
            )

        users_res = await self.db.execute(user_query.order_by(User.id))
        employees = users_res.scalars().all()
        emp_ids = [e.id for e in employees]

        if not emp_ids:
            return PerformanceCollectionReportResponse(
                month=month_display,
                date_from=active_start,
                date_to=active_end,
                monthly_performances=[],
                customer_collections=[],
                summary=PerformanceCollectionSummaryTotals(),
            )

        # 3. Fetch all daily activity reports for these employees in the active range
        stmt = (
            select(DailyActivityReport)
            .options(
                selectinload(DailyActivityReport.employee),
                selectinload(DailyActivityReport.call_entries),
                selectinload(DailyActivityReport.meeting_entries),
                selectinload(DailyActivityReport.sales_collection_entries),
            )
            .where(
                DailyActivityReport.employee_id.in_(emp_ids),
                DailyActivityReport.report_date >= active_start,
                DailyActivityReport.report_date <= active_end,
            )
            .order_by(DailyActivityReport.report_date.asc())
        )
        reports_res = await self.db.execute(stmt)
        all_reports = reports_res.scalars().all()

        # Group reports by employee_id
        emp_reports_map: Dict[int, List[DailyActivityReport]] = {e.id: [] for e in employees}
        for r in all_reports:
            emp_reports_map.setdefault(r.employee_id, []).append(r)

        # 4. Checkpoint day boundaries for Section 1 milestones
        milestone_days = [5, 10, 15, 20, 25, num_days]

        monthly_performances: List[EmployeeMonthlyPerformance] = []
        customer_collection_items: List[CustomerCollectionItem] = []

        summary_totals = {
            "total_target": Decimal("0"),
            "total_new_sales": Decimal("0"),
            "total_emi": Decimal("0"),
            "total_tb": Decimal("0"),
            "total_collection": Decimal("0"),
            "total_paid": Decimal("0"),
            "total_unpaid": Decimal("0"),
            "total_leads": 0,
            "total_fair_leads": 0,
            "total_fb_leads": 0,
            "total_hp": 0,
            "total_p": 0,
            "total_fup": 0,
        }

        # 5. Process each employee's Section 1 performance data
        for emp in employees:
            reports = emp_reports_map.get(emp.id, [])
            
            # Target lookup
            target_obj = await self.targets_repo.get_effective_target(active_end, emp.id)
            target_sales = (
                (target_obj.sales_target * Decimal("30"))
                if target_obj and target_obj.sales_target
                else Decimal("500000.00")
            )
            target_tb = (
                (target_obj.tb_target * Decimal("30"))
                if target_obj and target_obj.tb_target
                else Decimal("200000.00")
            )
            target_emi = (
                (getattr(target_obj, "emi_target", None) * Decimal("30"))
                if target_obj and getattr(target_obj, "emi_target", None)
                else Decimal("300000.00")
            )
            target_coll = target_sales + target_tb + target_emi

            # Full month metrics
            act_new_sales = Decimal("0")
            act_emi = Decimal("0")
            act_tb = Decimal("0")
            lead_total = 0
            fair_total = 0
            fb_total = 0
            hp_total = 0
            p_total = 0
            fup_total = 0

            # Prediction metrics
            pred_fair = Decimal("0")
            pred_fb = Decimal("0")
            pred_other = Decimal("0")
            pred_hold = Decimal("0")
            pred_cancel = Decimal("0")

            for r in reports:
                # Sales entries
                for se in r.sales_collection_entries:
                    cat = (se.category or "").lower()
                    amt = Decimal(str(se.amount or 0))
                    desc = (se.description or "").lower() + " " + (se.notes or "").lower()

                    if "new_sales" in cat:
                        if "commit" in cat or "payment" in cat:
                            # Prediction / commitment
                            if "fair" in desc:
                                pred_fair += amt
                            elif "fb" in desc or "facebook" in desc:
                                pred_fb += amt
                            else:
                                pred_other += amt
                        else:
                            act_new_sales += amt
                    elif "emi" in cat:
                        act_emi += amt
                    elif "tb" in cat or "token" in cat:
                        act_tb += amt

                    if "hold" in desc:
                        pred_hold += amt
                    if "cancel" in desc:
                        pred_cancel += amt

                # Call entries
                for ce in r.call_entries:
                    cat_name = (ce.lead_category or "").lower()
                    s1 = ce.slot_10am_1pm or 0
                    s2 = ce.slot_2pm_5pm or 0
                    s3 = ce.slot_5pm_6pm or 0
                    hp = ce.lead_status_hp or 0
                    p = ce.lead_status_p or 0
                    fub = ce.lead_status_fub or 0
                    outcomes = hp + p + fub + (ce.lead_status_ni or 0)
                    conn = ce.total_connected if (ce.total_connected and ce.total_connected >= outcomes) else outcomes
                    dialed = max(ce.total_dialed if ce.total_dialed is not None else (s1 + s2 + s3), conn)

                    lead_total += dialed
                    if "fair" in cat_name:
                        fair_total += dialed
                    elif "fb" in cat_name or "facebook" in cat_name:
                        fb_total += dialed

                    hp_total += hp
                    p_total += p
                    fup_total += fub

            tot_coll = act_new_sales + act_emi + act_tb

            # Calculate interval summaries (Till 5th, Till 10th, ..., Till 30th/31st)
            intervals: List[PerformanceIntervalSummary] = []
            for m_day in milestone_days:
                # Filter reports up to this checkpoint day
                sub_reports = [r for r in reports if r.report_date.day <= m_day]
                sub_new_sales = Decimal("0")
                sub_emi = Decimal("0")
                sub_tb = Decimal("0")
                sub_leads = 0
                sub_fair = 0
                sub_fb = 0
                sub_hp = 0
                sub_p = 0
                sub_fup = 0
                sub_outdoor = 0
                sub_indoor = 0

                for r in sub_reports:
                    for se in r.sales_collection_entries:
                        cat = (se.category or "").lower()
                        amt = Decimal(str(se.amount or 0))
                        if "new_sales" in cat and "commit" not in cat:
                            sub_new_sales += amt
                        elif "emi" in cat:
                            sub_emi += amt
                        elif "tb" in cat:
                            sub_tb += amt

                    for ce in r.call_entries:
                        cat_name = (ce.lead_category or "").lower()
                        s_sum = (ce.slot_10am_1pm or 0) + (ce.slot_2pm_5pm or 0) + (ce.slot_5pm_6pm or 0)
                        ce_d = ce.total_dialed if ce.total_dialed is not None else s_sum
                        sub_leads += ce_d
                        if "fair" in cat_name:
                            sub_fair += ce_d
                        elif "fb" in cat_name or "facebook" in cat_name:
                            sub_fb += ce_d
                        sub_hp += ce.lead_status_hp or 0
                        sub_p += ce.lead_status_p or 0
                        sub_fup += ce.lead_status_fub or 0

                    for me in r.meeting_entries:
                        act = (me.activity_type or "").lower()
                        val = me.total_count or (
                            (me.slot_10am_1pm or 0) + (me.slot_2pm_5pm or 0) + (me.slot_5pm_6pm or 0)
                        )
                        if "outdoor" in act:
                            sub_outdoor += val
                        elif "indoor" in act:
                            sub_indoor += val

                label = f"Till {m_day}th" if m_day != num_days else f"Till {num_days}th (Full Month)"
                intervals.append(
                    PerformanceIntervalSummary(
                        label=label,
                        end_day=m_day,
                        new_sales=sub_new_sales,
                        emi=sub_emi,
                        total_collection=sub_new_sales + sub_emi + sub_tb,
                        total_lead=sub_leads,
                        fair_lead=sub_fair,
                        fb_lead=sub_fb,
                        hp=sub_hp,
                        p=sub_p,
                        fup=sub_fup,
                        outdoor_visits=sub_outdoor,
                        indoor_cx=sub_indoor,
                    )
                )

            # Role formatted display
            pos_title = (
                "Sales Executive"
                if emp.role == UserRole.EMPLOYEE
                else "Team Lead"
                if emp.role == UserRole.TL
                else "Coordinator"
                if emp.role == UserRole.CO
                else "Management"
            )

            monthly_performances.append(
                EmployeeMonthlyPerformance(
                    employee_id=emp.id,
                    employee_name=emp.full_name,
                    position=pos_title,
                    month=month_display,
                    target_sales=target_sales,
                    target_collection=target_coll,
                    actual_new_sales=act_new_sales,
                    actual_emi=act_emi,
                    actual_tb=act_tb,
                    total_collection=tot_coll,
                    total_lead=lead_total,
                    fair_lead=fair_total,
                    fb_lead=fb_total,
                    hp=hp_total,
                    p=p_total,
                    fup=fup_total,
                    prediction_sold_fair=pred_fair,
                    prediction_sold_fb=pred_fb,
                    prediction_sold_other=pred_other,
                    prediction_hold=pred_hold,
                    prediction_cancel=pred_cancel,
                    intervals=intervals,
                )
            )

            # Accumulate summary totals
            summary_totals["total_target"] += target_sales
            summary_totals["total_new_sales"] += act_new_sales
            summary_totals["total_emi"] += act_emi
            summary_totals["total_tb"] += act_tb
            summary_totals["total_collection"] += tot_coll
            summary_totals["total_leads"] += lead_total
            summary_totals["total_fair_leads"] += fair_total
            summary_totals["total_fb_leads"] += fb_total
            summary_totals["total_hp"] += hp_total
            summary_totals["total_p"] += p_total
            summary_totals["total_fup"] += fup_total

        # 6. Process Section 2: Customer-wise Collection Report rows
        customer_item_id = 1
        for r in all_reports:
            # Parse client contacts stored in report.notes if present
            client_contacts_dict: Dict[str, Any] = {}
            if r.notes:
                try:
                    notes_data = json.loads(r.notes)
                    if isinstance(notes_data, dict) and "client_contacts" in notes_data:
                        for cc in notes_data["client_contacts"]:
                            c_name = (cc.get("client_name") or "").strip().lower()
                            if c_name:
                                client_contacts_dict[c_name] = cc
                except Exception:
                    pass

            # Check if this daily report had Outdoor visits or Indoor CX
            has_outdoor = False
            has_indoor = False
            for me in r.meeting_entries:
                act = (me.activity_type or "").lower()
                c_val = me.total_count or (
                    (me.slot_10am_1pm or 0) + (me.slot_2pm_5pm or 0) + (me.slot_5pm_6pm or 0)
                )
                if c_val > 0:
                    if "outdoor" in act:
                        has_outdoor = True
                    elif "indoor" in act:
                        has_indoor = True

            default_in_out = (
                "Outdoor Visit"
                if has_outdoor
                else "Indoor CX"
                if has_indoor
                else "Office / Call"
            )

            for se in r.sales_collection_entries:
                cat = (se.category or "").lower()
                amt = Decimal(str(se.amount or 0))
                cust_name = se.customer_name or se.description or "Direct Customer"
                cust_lower = cust_name.strip().lower()
                matched_contact = client_contacts_dict.get(cust_lower)

                # Paid vs Unpaid classification
                is_commitment = "commit" in cat or "token_to_booking" in cat
                paid = Decimal("0") if is_commitment else amt
                unpaid = amt if is_commitment else Decimal("0")

                # Amounts by specific category
                new_sales_amt = amt if "new_sales" in cat else Decimal("0")
                tb_amt = amt if "tb" in cat or "token" in cat else Decimal("0")
                emi_amt = amt if "emi" in cat else Decimal("0")
                tot_amt = new_sales_amt + tb_amt + emi_amt

                # Date-1 & Date-2 determination
                date_1 = r.report_date
                date_2: Optional[date] = None

                # Next collection date
                next_coll_date = se.expected_payment_date

                # Follow-up date from matched contact or reschedule audit
                if matched_contact and matched_contact.get("follow_up_date"):
                    try:
                        date_2 = date.fromisoformat(matched_contact["follow_up_date"])
                    except Exception:
                        pass
                elif se.reschedule_history and isinstance(se.reschedule_history, list) and se.reschedule_history:
                    # Previous promised date
                    last_h = se.reschedule_history[-1]
                    if isinstance(last_h, dict) and last_h.get("old_date"):
                        try:
                            date_2 = date.fromisoformat(last_h["old_date"])
                        except Exception:
                            pass

                # IN/OUT Plan
                in_out_plan = default_in_out
                if matched_contact and matched_contact.get("category") == "CX":
                    in_out_plan = "Indoor CX"
                elif "outdoor" in (se.notes or "").lower():
                    in_out_plan = "Outdoor Visit"
                elif "indoor" in (se.notes or "").lower():
                    in_out_plan = "Indoor CX"

                # Lead Status
                lead_status = "P"
                if matched_contact and matched_contact.get("category"):
                    lead_status = str(matched_contact["category"])
                elif "hp" in (se.notes or "").lower():
                    lead_status = "HP"
                elif "fub" in (se.notes or "").lower() or "follow" in (se.notes or "").lower():
                    lead_status = "FUB"
                elif "ni" in (se.notes or "").lower():
                    lead_status = "NI"
                elif not is_commitment and paid > 0:
                    lead_status = "Paid"

                # Apply lead status filter if provided
                if lead_status_filter and lead_status_filter != "ALL":
                    if lead_status.upper() != lead_status_filter.upper():
                        continue

                item = CustomerCollectionItem(
                    id=se.id or customer_item_id,
                    customer_name=cust_name,
                    customer_phone=se.customer_phone or (matched_contact.get("phone_number") if matched_contact else None),
                    paid_amount=paid,
                    unpaid_amount=unpaid,
                    collection_date=r.report_date if paid > 0 else None,
                    in_out_plan=in_out_plan,
                    date_1=date_1,
                    date_2=date_2,
                    new_sales_amount=new_sales_amt,
                    tb_amount=tb_amt,
                    emi_amount=emi_amt,
                    next_collection_date=next_coll_date,
                    lead_status=lead_status,
                    total_collection=tot_amt,
                    remarks=se.notes or se.description,
                    employee_id=r.employee_id,
                    employee_name=r.employee.full_name if r.employee else "Employee",
                )
                customer_collection_items.append(item)
                summary_totals["total_paid"] += paid
                summary_totals["total_unpaid"] += unpaid
                customer_item_id += 1

        summary_response = PerformanceCollectionSummaryTotals(**summary_totals)

        return PerformanceCollectionReportResponse(
            month=month_display,
            date_from=active_start,
            date_to=active_end,
            monthly_performances=monthly_performances,
            customer_collections=customer_collection_items,
            summary=summary_response,
        )

