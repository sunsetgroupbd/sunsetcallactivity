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
from typing import List, Optional, Dict, Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.milestone_checkpoint import MilestoneCheckpoint
from app.models.report import DailyActivityReport
from app.models.user import User, UserRole
from app.repositories.targets_repo import TargetsRepository
from app.schemas.performance_collection_report import (
    CustomerCollectionItem,
    EmployeeMonthlyPerformance,
    PerformanceCollectionReportResponse,
    PerformanceCollectionSummaryTotals,
    PerformanceIntervalSummary,
    MilestoneCheckpointItem,
    MilestoneCheckpointsBulkSaveRequest,
    MilestoneCheckpointRead,
)


class PerformanceCollectionService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.targets_repo = TargetsRepository(db)

    @staticmethod
    def _aggregate_reports_metrics(rep_list: List[DailyActivityReport]) -> Dict[str, Any]:
        act_new_sales = Decimal("0")
        act_emi = Decimal("0")
        act_tb = Decimal("0")
        lead_total = 0
        fair_total = 0
        fb_total = 0
        hp_total = 0
        p_total = 0
        fup_total = 0
        calls_total = 0
        outdoor_total = 0
        indoor_total = 0
        pred_fair = Decimal("0")
        pred_fb = Decimal("0")
        pred_other = Decimal("0")
        pred_hold = Decimal("0")
        pred_cancel = Decimal("0")

        for r in rep_list:
            for se in r.sales_collection_entries:
                cat = (se.category or "").lower()
                amt = Decimal(str(se.amount or 0))
                desc = (se.description or "").lower() + " " + (se.notes or "").lower()

                if "new_sales" in cat:
                    if "commit" in cat or "payment" in cat:
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

            for ce in r.call_entries:
                cat_name = (ce.lead_category or "").lower()
                s_sum = (ce.slot_10am_1pm or 0) + (ce.slot_2pm_5pm or 0) + (ce.slot_5pm_6pm or 0)
                ce_d = ce.total_dialed if ce.total_dialed is not None else s_sum
                calls_total += ce_d
                lead_total += ce_d
                if "fair" in cat_name:
                    fair_total += ce_d
                elif "fb" in cat_name or "facebook" in cat_name:
                    fb_total += ce_d
                hp_total += ce.lead_status_hp or 0
                p_total += ce.lead_status_p or 0
                fup_total += ce.lead_status_fub or 0

            for me in r.meeting_entries:
                act = (me.activity_type or "").lower()
                val = me.total_count or ((me.slot_10am_1pm or 0) + (me.slot_2pm_5pm or 0) + (me.slot_5pm_6pm or 0))
                if "outdoor" in act:
                    outdoor_total += val
                elif "indoor" in act:
                    indoor_total += val

        return {
            "new_sales": act_new_sales,
            "emi": act_emi,
            "tb": act_tb,
            "total_collection": act_new_sales + act_emi + act_tb,
            "total_lead": lead_total,
            "fair_lead": fair_total,
            "fb_lead": fb_total,
            "hp": hp_total,
            "p": p_total,
            "fup": fup_total,
            "total_calls": calls_total,
            "outdoor_visits": outdoor_total,
            "indoor_cx": indoor_total,
            "prediction_sold_fair": pred_fair,
            "prediction_sold_fb": pred_fb,
            "prediction_sold_other": pred_other,
            "prediction_hold": pred_hold,
            "prediction_cancel": pred_cancel,
            "total_lead_hp_p": hp_total + p_total,
        }

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

        # Determine 2 previous months (e.g. if active is Nov-26 -> Oct-26 and Sep-26)
        if month > 2:
            prev1_m, prev1_y = month - 1, year
            prev2_m, prev2_y = month - 2, year
        elif month == 2:
            prev1_m, prev1_y = 1, year
            prev2_m, prev2_y = 12, year - 1
        else:
            prev1_m, prev1_y = 12, year - 1
            prev2_m, prev2_y = 11, year - 1

        prev2_start = date(prev2_y, prev2_m, 1)

        # 3. Fetch all daily activity reports for these employees covering 3 months (history + active)
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
                DailyActivityReport.report_date >= prev2_start,
                DailyActivityReport.report_date <= active_end,
            )
            .order_by(DailyActivityReport.report_date.asc())
        )
        reports_res = await self.db.execute(stmt)
        all_3m_reports = reports_res.scalars().all()

        # Active month reports only for Section 2 and current period summary
        all_reports = [r for r in all_3m_reports if r.report_date >= active_start and r.report_date <= active_end]

        # Group reports by employee_id for all 3 months
        emp_reports_map: Dict[int, List[DailyActivityReport]] = {e.id: [] for e in employees}
        for r in all_3m_reports:
            emp_reports_map.setdefault(r.employee_id, []).append(r)

        # 4. Checkpoint day boundaries for Section 1 milestones
        milestone_days = [5, 10, 15, 20, 25, num_days]

        # Fetch manual milestone review session entries for this active month
        active_month_str = f"{year:04d}-{month:02d}"
        mc_query = select(MilestoneCheckpoint).where(MilestoneCheckpoint.month == active_month_str)
        mc_res = await self.db.execute(mc_query)
        all_mc_records = mc_res.scalars().all()

        employee_manual_map: Dict[tuple[int, int], MilestoneCheckpoint] = {}
        company_manual_map: Dict[int, MilestoneCheckpoint] = {}
        for rec in all_mc_records:
            if rec.employee_id is not None:
                employee_manual_map[(rec.employee_id, rec.checkpoint_day)] = rec
            else:
                company_manual_map[rec.checkpoint_day] = rec

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
            all_emp_reports = emp_reports_map.get(emp.id, [])
            curr_reports = [r for r in all_emp_reports if r.report_date >= active_start and r.report_date <= active_end]
            prev1_reports = [r for r in all_emp_reports if r.report_date.year == prev1_y and r.report_date.month == prev1_m]
            prev2_reports = [r for r in all_emp_reports if r.report_date.year == prev2_y and r.report_date.month == prev2_m]

            # Role formatted display
            pos_title: str = (
                emp.designation
                if emp.designation
                else "Sales Executive"
                if emp.role == UserRole.EMPLOYEE
                else "Team Lead"
                if emp.role == UserRole.TL
                else "Coordinator"
                if emp.role == UserRole.CO
                else "Management"
            )
            gl_title = "GL" if ("gl" in pos_title.lower() or "group lead" in pos_title.lower()) else (
                "GL" if emp.role == UserRole.EMPLOYEE else pos_title
            )

            # Target lookup
            target_obj = await self.targets_repo.get_effective_target(active_end, emp.id)
            target_sales = (
                (Decimal(str(target_obj.sales_target)) * Decimal("30"))
                if target_obj and target_obj.sales_target is not None
                else Decimal("500000.00")
            )
            target_tb = (
                (Decimal(str(target_obj.tb_target)) * Decimal("30"))
                if target_obj and target_obj.tb_target is not None
                else Decimal("200000.00")
            )
            target_emi_val = getattr(target_obj, "emi_target", None) if target_obj else None
            target_emi = (
                (Decimal(str(target_emi_val)) * Decimal("30"))
                if target_emi_val is not None
                else Decimal("300000.00")
            )
            target_coll = target_sales + target_tb + target_emi

            # Active month aggregated metrics
            curr_metrics = self._aggregate_reports_metrics(curr_reports)
            m1_metrics = self._aggregate_reports_metrics(prev1_reports)
            m2_metrics = self._aggregate_reports_metrics(prev2_reports)

            # Build previous 2 months history objects
            m2_label = f"{calendar.month_abbr[prev2_m]}-{str(prev2_y)[-2:]}"
            m1_label = f"{calendar.month_abbr[prev1_m]}-{str(prev1_y)[-2:]}"
            curr_month_label = f"{calendar.month_abbr[month]}-{str(year)[-2:]}"

            m2_perf = EmployeeMonthlyPerformance(
                employee_id=emp.id,
                employee_name=emp.full_name,
                position=pos_title,
                month=m2_label,
                target_sales=target_sales,
                target_collection=target_coll,
                actual_new_sales=m2_metrics["new_sales"],
                actual_emi=m2_metrics["emi"],
                actual_tb=m2_metrics["tb"],
                total_collection=m2_metrics["total_collection"],
                total_lead=m2_metrics["total_lead"],
                fair_lead=m2_metrics["fair_lead"],
                fb_lead=m2_metrics["fb_lead"],
                hp=m2_metrics["hp"],
                p=m2_metrics["p"],
                fup=m2_metrics["fup"],
                total_calls=m2_metrics["total_calls"],
                prediction_sold_fair=m2_metrics["prediction_sold_fair"],
                prediction_sold_fb=m2_metrics["prediction_sold_fb"],
                prediction_sold_other=m2_metrics["prediction_sold_other"],
                gl=gl_title,
                prediction_hold=m2_metrics["prediction_hold"],
                prediction_cancel=m2_metrics["prediction_cancel"],
                total_lead_hp_p=m2_metrics["total_lead_hp_p"],
                intervals=[],
                history_months=[],
            )

            m1_perf = EmployeeMonthlyPerformance(
                employee_id=emp.id,
                employee_name=emp.full_name,
                position=pos_title,
                month=m1_label,
                target_sales=target_sales,
                target_collection=target_coll,
                actual_new_sales=m1_metrics["new_sales"],
                actual_emi=m1_metrics["emi"],
                actual_tb=m1_metrics["tb"],
                total_collection=m1_metrics["total_collection"],
                total_lead=m1_metrics["total_lead"],
                fair_lead=m1_metrics["fair_lead"],
                fb_lead=m1_metrics["fb_lead"],
                hp=m1_metrics["hp"],
                p=m1_metrics["p"],
                fup=m1_metrics["fup"],
                total_calls=m1_metrics["total_calls"],
                prediction_sold_fair=m1_metrics["prediction_sold_fair"],
                prediction_sold_fb=m1_metrics["prediction_sold_fb"],
                prediction_sold_other=m1_metrics["prediction_sold_other"],
                gl=gl_title,
                prediction_hold=m1_metrics["prediction_hold"],
                prediction_cancel=m1_metrics["prediction_cancel"],
                total_lead_hp_p=m1_metrics["total_lead_hp_p"],
                intervals=[],
                history_months=[],
            )

            # Calculate interval summaries (Till 5th, Till 10th, ..., Till 30th/31st)
            intervals: List[PerformanceIntervalSummary] = []
            for m_day in milestone_days:
                sub_reports = [r for r in curr_reports if r.report_date.day <= m_day]
                sub_m = self._aggregate_reports_metrics(sub_reports)
                label = f"Till {m_day}th" if m_day < 30 else "Till 30/31th"

                if (emp.id, m_day) in employee_manual_map:
                    rec = employee_manual_map[(emp.id, m_day)]
                    intervals.append(
                        PerformanceIntervalSummary(
                            label=rec.label or label,
                            end_day=m_day,
                            new_sales=rec.new_sales,
                            emi=rec.emi,
                            total_collection=rec.total_collection,
                            total_lead=rec.total_lead,
                            fair_lead=rec.fair_lead,
                            fb_lead=rec.fb_lead,
                            hp=rec.hp,
                            p=rec.p,
                            fup=rec.fup,
                            outdoor_visits=rec.outdoor_visits,
                            indoor_cx=rec.indoor_cx,
                            total_calls=getattr(rec, "total_calls", 0) or sub_m["total_calls"],
                            sold_fair=getattr(rec, "sold_fair", Decimal("0")) or sub_m["prediction_sold_fair"],
                            sold_fb=getattr(rec, "sold_fb", Decimal("0")) or sub_m["prediction_sold_fb"],
                            sold_other=getattr(rec, "sold_other", Decimal("0")) or sub_m["prediction_sold_other"],
                            gl=getattr(rec, "gl", None) or gl_title,
                            hold=getattr(rec, "hold", Decimal("0")) or sub_m["prediction_hold"],
                            cancel=getattr(rec, "cancel", Decimal("0")) or sub_m["prediction_cancel"],
                            total_lead_hp_p=rec.hp + rec.p,
                            is_manual=True,
                            admin_notes=rec.admin_notes,
                        )
                    )
                else:
                    intervals.append(
                        PerformanceIntervalSummary(
                            label=label,
                            end_day=m_day,
                            new_sales=sub_m["new_sales"],
                            emi=sub_m["emi"],
                            total_collection=sub_m["total_collection"],
                            total_lead=sub_m["total_lead"],
                            fair_lead=sub_m["fair_lead"],
                            fb_lead=sub_m["fb_lead"],
                            hp=sub_m["hp"],
                            p=sub_m["p"],
                            fup=sub_m["fup"],
                            outdoor_visits=sub_m["outdoor_visits"],
                            indoor_cx=sub_m["indoor_cx"],
                            total_calls=sub_m["total_calls"],
                            sold_fair=sub_m["prediction_sold_fair"],
                            sold_fb=sub_m["prediction_sold_fb"],
                            sold_other=sub_m["prediction_sold_other"],
                            gl=gl_title,
                            hold=sub_m["prediction_hold"],
                            cancel=sub_m["prediction_cancel"],
                            total_lead_hp_p=sub_m["total_lead_hp_p"],
                            is_manual=False,
                        )
                    )

            monthly_performances.append(
                EmployeeMonthlyPerformance(
                    employee_id=emp.id,
                    employee_name=emp.full_name,
                    position=pos_title,
                    month=curr_month_label,
                    target_sales=target_sales,
                    target_collection=target_coll,
                    actual_new_sales=curr_metrics["new_sales"],
                    actual_emi=curr_metrics["emi"],
                    actual_tb=curr_metrics["tb"],
                    total_collection=curr_metrics["total_collection"],
                    total_lead=curr_metrics["total_lead"],
                    fair_lead=curr_metrics["fair_lead"],
                    fb_lead=curr_metrics["fb_lead"],
                    hp=curr_metrics["hp"],
                    p=curr_metrics["p"],
                    fup=curr_metrics["fup"],
                    total_calls=curr_metrics["total_calls"],
                    prediction_sold_fair=curr_metrics["prediction_sold_fair"],
                    prediction_sold_fb=curr_metrics["prediction_sold_fb"],
                    prediction_sold_other=curr_metrics["prediction_sold_other"],
                    gl=gl_title,
                    prediction_hold=curr_metrics["prediction_hold"],
                    prediction_cancel=curr_metrics["prediction_cancel"],
                    total_lead_hp_p=curr_metrics["total_lead_hp_p"],
                    intervals=intervals,
                    history_months=[m2_perf, m1_perf],
                )
            )

            # Accumulate summary totals
            summary_totals["total_target"] += target_sales
            summary_totals["total_new_sales"] += curr_metrics["new_sales"]
            summary_totals["total_emi"] += curr_metrics["emi"]
            summary_totals["total_tb"] += curr_metrics["tb"]
            summary_totals["total_collection"] += curr_metrics["total_collection"]
            summary_totals["total_leads"] += curr_metrics["total_lead"]
            summary_totals["total_fair_leads"] += curr_metrics["fair_lead"]
            summary_totals["total_fb_leads"] += curr_metrics["fb_lead"]
            summary_totals["total_hp"] += curr_metrics["hp"]
            summary_totals["total_p"] += curr_metrics["p"]
            summary_totals["total_fup"] += curr_metrics["fup"]

        # 5. Compute Company-Wide Intervals (either manual session or aggregate across staff)
        company_intervals: List[PerformanceIntervalSummary] = []
        for idx, m_day in enumerate(milestone_days):
            label = f"Till {m_day}th" if m_day < 30 else "Till 30/31th"
            if m_day in company_manual_map:
                rec = company_manual_map[m_day]
                company_intervals.append(
                    PerformanceIntervalSummary(
                        label=rec.label or label,
                        end_day=m_day,
                        new_sales=rec.new_sales,
                        emi=rec.emi,
                        total_collection=rec.total_collection,
                        total_lead=rec.total_lead,
                        fair_lead=rec.fair_lead,
                        fb_lead=rec.fb_lead,
                        hp=rec.hp,
                        p=rec.p,
                        fup=rec.fup,
                        outdoor_visits=rec.outdoor_visits,
                        indoor_cx=rec.indoor_cx,
                        total_calls=getattr(rec, "total_calls", 0),
                        sold_fair=getattr(rec, "sold_fair", Decimal("0")),
                        sold_fb=getattr(rec, "sold_fb", Decimal("0")),
                        sold_other=getattr(rec, "sold_other", Decimal("0")),
                        gl=getattr(rec, "gl", None) or "Company GL",
                        hold=getattr(rec, "hold", Decimal("0")),
                        cancel=getattr(rec, "cancel", Decimal("0")),
                        total_lead_hp_p=rec.hp + rec.p,
                        is_manual=True,
                        admin_notes=rec.admin_notes,
                    )
                )
            else:
                c_new_sales = sum(
                    (p.intervals[idx].new_sales for p in monthly_performances if len(p.intervals) > idx),
                    Decimal("0"),
                )
                c_emi = sum(
                    (p.intervals[idx].emi for p in monthly_performances if len(p.intervals) > idx),
                    Decimal("0"),
                )
                c_tot_coll = sum(
                    (p.intervals[idx].total_collection for p in monthly_performances if len(p.intervals) > idx),
                    Decimal("0"),
                )
                c_leads = sum(
                    (p.intervals[idx].total_lead for p in monthly_performances if len(p.intervals) > idx),
                    0,
                )
                c_fair = sum(
                    (p.intervals[idx].fair_lead for p in monthly_performances if len(p.intervals) > idx),
                    0,
                )
                c_fb = sum(
                    (p.intervals[idx].fb_lead for p in monthly_performances if len(p.intervals) > idx),
                    0,
                )
                c_hp = sum(
                    (p.intervals[idx].hp for p in monthly_performances if len(p.intervals) > idx),
                    0,
                )
                c_p = sum(
                    (p.intervals[idx].p for p in monthly_performances if len(p.intervals) > idx),
                    0,
                )
                c_fup = sum(
                    (p.intervals[idx].fup for p in monthly_performances if len(p.intervals) > idx),
                    0,
                )
                c_outdoor = sum(
                    (p.intervals[idx].outdoor_visits for p in monthly_performances if len(p.intervals) > idx),
                    0,
                )
                c_indoor = sum(
                    (p.intervals[idx].indoor_cx for p in monthly_performances if len(p.intervals) > idx),
                    0,
                )
                c_calls = sum(
                    (p.intervals[idx].total_calls for p in monthly_performances if len(p.intervals) > idx),
                    0,
                )
                c_sold_fair = sum(
                    (p.intervals[idx].sold_fair for p in monthly_performances if len(p.intervals) > idx),
                    Decimal("0"),
                )
                c_sold_fb = sum(
                    (p.intervals[idx].sold_fb for p in monthly_performances if len(p.intervals) > idx),
                    Decimal("0"),
                )
                c_sold_other = sum(
                    (p.intervals[idx].sold_other for p in monthly_performances if len(p.intervals) > idx),
                    Decimal("0"),
                )
                c_hold = sum(
                    (p.intervals[idx].hold for p in monthly_performances if len(p.intervals) > idx),
                    Decimal("0"),
                )
                c_cancel = sum(
                    (p.intervals[idx].cancel for p in monthly_performances if len(p.intervals) > idx),
                    Decimal("0"),
                )
                company_intervals.append(
                    PerformanceIntervalSummary(
                        label=label,
                        end_day=m_day,
                        new_sales=c_new_sales,
                        emi=c_emi,
                        total_collection=c_tot_coll,
                        total_lead=c_leads,
                        fair_lead=c_fair,
                        fb_lead=c_fb,
                        hp=c_hp,
                        p=c_p,
                        fup=c_fup,
                        outdoor_visits=c_outdoor,
                        indoor_cx=c_indoor,
                        total_calls=c_calls,
                        sold_fair=c_sold_fair,
                        sold_fb=c_sold_fb,
                        sold_other=c_sold_other,
                        gl="All GLs",
                        hold=c_hold,
                        cancel=c_cancel,
                        total_lead_hp_p=c_hp + c_p,
                        is_manual=False,
                    )
                )

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

                # Lead Source determination
                notes_text = (se.notes or "").lower() + " " + (se.description or "").lower()
                lead_src = "Direct Lead"
                if "fair" in notes_text:
                    lead_src = "Fair Lead"
                elif "fb" in notes_text or "facebook" in notes_text:
                    lead_src = "Facebook Lead"
                elif "ref" in notes_text or "referral" in notes_text:
                    lead_src = "Referral"
                elif "outdoor" in notes_text:
                    lead_src = "Outdoor Visit"
                elif "indoor" in notes_text or "cx" in notes_text:
                    lead_src = "Indoor CX"
                elif matched_contact and matched_contact.get("source"):
                    lead_src = str(matched_contact["source"])

                # Lead Source Date
                lead_src_date = date_1 or r.report_date

                # Second Next Collection Date
                next_coll_date_2 = date_2 if (date_2 and date_2 != next_coll_date) else None

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
                    next_collection_date_2=next_coll_date_2,
                    lead_status=lead_status,
                    lead_source=lead_src,
                    lead_source_date=lead_src_date,
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
            company_intervals=company_intervals,
        )

    async def save_milestone_checkpoints(
        self,
        data: MilestoneCheckpointsBulkSaveRequest,
        admin_user: User,
    ) -> List[MilestoneCheckpointRead]:
        """Save/upsert manual review session checkpoints for Company-Wide or specific Employee."""
        results: List[MilestoneCheckpointRead] = []
        for cp in data.checkpoints:
            stmt = select(MilestoneCheckpoint).where(
                MilestoneCheckpoint.month == data.month,
                MilestoneCheckpoint.checkpoint_day == cp.checkpoint_day,
            )
            if data.employee_id is not None:
                stmt = stmt.where(MilestoneCheckpoint.employee_id == data.employee_id)
            else:
                stmt = stmt.where(MilestoneCheckpoint.employee_id.is_(None))

            res = await self.db.execute(stmt)
            existing = res.scalar_one_or_none()

            tot_coll = cp.total_collection
            if tot_coll == Decimal("0") and (cp.new_sales > 0 or cp.emi > 0):
                tot_coll = cp.new_sales + cp.emi

            if existing:
                existing.label = cp.label
                existing.new_sales = cp.new_sales
                existing.emi = cp.emi
                existing.total_collection = tot_coll
                existing.total_lead = cp.total_lead
                existing.fair_lead = cp.fair_lead
                existing.fb_lead = cp.fb_lead
                existing.hp = cp.hp
                existing.p = cp.p
                existing.fup = cp.fup
                existing.outdoor_visits = cp.outdoor_visits
                existing.indoor_cx = cp.indoor_cx
                existing.total_calls = cp.total_calls
                existing.sold_fair = cp.sold_fair
                existing.sold_fb = cp.sold_fb
                existing.sold_other = cp.sold_other
                existing.gl = cp.gl
                existing.hold = cp.hold
                existing.cancel = cp.cancel
                existing.admin_notes = cp.admin_notes
                existing.updated_by_id = admin_user.id
                target_rec = existing
            else:
                target_rec = MilestoneCheckpoint(
                    month=data.month,
                    employee_id=data.employee_id,
                    checkpoint_day=cp.checkpoint_day,
                    label=cp.label,
                    new_sales=cp.new_sales,
                    emi=cp.emi,
                    total_collection=tot_coll,
                    total_lead=cp.total_lead,
                    fair_lead=cp.fair_lead,
                    fb_lead=cp.fb_lead,
                    hp=cp.hp,
                    p=cp.p,
                    fup=cp.fup,
                    outdoor_visits=cp.outdoor_visits,
                    indoor_cx=cp.indoor_cx,
                    total_calls=cp.total_calls,
                    sold_fair=cp.sold_fair,
                    sold_fb=cp.sold_fb,
                    sold_other=cp.sold_other,
                    gl=cp.gl,
                    hold=cp.hold,
                    cancel=cp.cancel,
                    admin_notes=cp.admin_notes,
                    updated_by_id=admin_user.id,
                )
                self.db.add(target_rec)

            await self.db.flush()
            results.append(
                MilestoneCheckpointRead(
                    id=target_rec.id,
                    month=target_rec.month,
                    employee_id=target_rec.employee_id,
                    checkpoint_day=target_rec.checkpoint_day,
                    label=target_rec.label,
                    new_sales=target_rec.new_sales,
                    emi=target_rec.emi,
                    total_collection=target_rec.total_collection,
                    total_lead=target_rec.total_lead,
                    fair_lead=target_rec.fair_lead,
                    fb_lead=target_rec.fb_lead,
                    hp=target_rec.hp,
                    p=target_rec.p,
                    fup=target_rec.fup,
                    outdoor_visits=target_rec.outdoor_visits,
                    indoor_cx=target_rec.indoor_cx,
                    total_calls=getattr(target_rec, "total_calls", 0),
                    sold_fair=getattr(target_rec, "sold_fair", Decimal("0")),
                    sold_fb=getattr(target_rec, "sold_fb", Decimal("0")),
                    sold_other=getattr(target_rec, "sold_other", Decimal("0")),
                    gl=getattr(target_rec, "gl", None),
                    hold=getattr(target_rec, "hold", Decimal("0")),
                    cancel=getattr(target_rec, "cancel", Decimal("0")),
                    admin_notes=target_rec.admin_notes,
                    is_manual=True,
                    updated_by_id=target_rec.updated_by_id,
                )
            )

        await self.db.commit()
        return results

    async def get_milestone_checkpoints(
        self,
        month: str,
        employee_id: Optional[int] = None,
    ) -> List[MilestoneCheckpointRead]:
        """Retrieve saved manual session checkpoints."""
        stmt = select(MilestoneCheckpoint).where(MilestoneCheckpoint.month == month)
        if employee_id is not None:
            stmt = stmt.where(MilestoneCheckpoint.employee_id == employee_id)
        else:
            stmt = stmt.where(MilestoneCheckpoint.employee_id.is_(None))
        stmt = stmt.order_by(MilestoneCheckpoint.checkpoint_day.asc())

        res = await self.db.execute(stmt)
        records = res.scalars().all()
        return [
            MilestoneCheckpointRead(
                id=r.id,
                month=r.month,
                employee_id=r.employee_id,
                checkpoint_day=r.checkpoint_day,
                label=r.label,
                new_sales=r.new_sales,
                emi=r.emi,
                total_collection=r.total_collection,
                total_lead=r.total_lead,
                fair_lead=r.fair_lead,
                fb_lead=r.fb_lead,
                hp=r.hp,
                p=r.p,
                fup=r.fup,
                outdoor_visits=r.outdoor_visits,
                indoor_cx=r.indoor_cx,
                total_calls=getattr(r, "total_calls", 0),
                sold_fair=getattr(r, "sold_fair", Decimal("0")),
                sold_fb=getattr(r, "sold_fb", Decimal("0")),
                sold_other=getattr(r, "sold_other", Decimal("0")),
                gl=getattr(r, "gl", None),
                hold=getattr(r, "hold", Decimal("0")),
                cancel=getattr(r, "cancel", Decimal("0")),
                admin_notes=r.admin_notes,
                is_manual=True,
                updated_by_id=r.updated_by_id,
            )
            for r in records
        ]

    async def reset_milestone_checkpoints(
        self,
        month: str,
        employee_id: Optional[int] = None,
        checkpoint_day: Optional[int] = None,
    ) -> int:
        """Reset manual checkpoints back to auto-calculated report data."""
        from sqlalchemy import delete
        stmt = delete(MilestoneCheckpoint).where(MilestoneCheckpoint.month == month)
        if employee_id is not None:
            stmt = stmt.where(MilestoneCheckpoint.employee_id == employee_id)
        else:
            stmt = stmt.where(MilestoneCheckpoint.employee_id.is_(None))
        if checkpoint_day is not None:
            stmt = stmt.where(MilestoneCheckpoint.checkpoint_day == checkpoint_day)

        res = await self.db.execute(stmt)
        await self.db.commit()
        return res.rowcount

