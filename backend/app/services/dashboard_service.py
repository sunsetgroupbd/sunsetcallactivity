"""
DashboardService — aggregate calculations for the dashboard API.

All calculations are derived from saved detail records.
Client-submitted totals are never trusted for dashboard figures.

FORMULAS:
  connection_rate_pct = (total_connected / total_dialed * 100).quantize(Decimal("0.01"))
    Returns None if total_dialed == 0.
  achievement_pct = (actual / target * 100).quantize(Decimal("0.01"))
    Returns None if target is None or target == 0.
"""
from __future__ import annotations

import calendar
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional, Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.call_activity import CallActivityEntry
from app.models.meeting_activity import MeetingActivityEntry
from app.models.report import DailyActivityReport, ReportStatus
from app.models.sales_collection import SalesCollectionEntry
from app.repositories.call_repo import CallActivityRepository
from app.repositories.meeting_repo import MeetingActivityRepository
from app.repositories.report_repo import ReportRepository
from app.repositories.sales_repo import SalesCollectionRepository
from app.repositories.targets_repo import TargetsRepository
from app.schemas.dashboard import (
    DashboardSummary,
    LeadCategoryBreakdown,
    ReportSummary,
    SlotBreakdown,
    TargetAchievement,
    EmployeeLeaderboardItem,
    KPIChampion,
    PerformanceLeaderboardResponse,
    DailyTrendPoint,
    FinancialTrendResponse,
)
from app.services.sales_service import SalesService


class DashboardService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.report_repo = ReportRepository(db)
        self.call_repo = CallActivityRepository(db)
        self.meeting_repo = MeetingActivityRepository(db)
        self.sales_repo = SalesCollectionRepository(db)
        self.targets_repo = TargetsRepository(db)

    async def get_target_with_carry_forward(
        self, report_date: date, employee_id: Optional[int]
    ) -> dict[str, Any]:
        """
        Calculate effective targets for an employee on report_date, including carry-forward deficit
        from earlier days in the current month.
        If an employee had a daily target (e.g. 10,000 BDT) and fell short on previous days,
        the unfulfilled deficit rolls over to today's target (e.g. 20,000 BDT).
        """
        from datetime import timedelta
        from sqlalchemy.orm import selectinload

        target = await self.targets_repo.get_effective_target(report_date, employee_id)
        if not target:
            return {
                "target": None,
                "sales_target": None,
                "sales_base": None,
                "sales_carry_forward": Decimal("0"),
                "tb_target": None,
                "tb_base": None,
                "tb_carry_forward": Decimal("0"),
                "emi_target": None,
                "emi_base": None,
                "emi_carry_forward": Decimal("0"),
                "dialed_target": None,
                "connected_target": None,
                "outdoor_target": None,
                "meeting_target": None,
                "monthly_sales_target": None,
                "monthly_tb_target": None,
                "monthly_emi_target": None,
            }

        sales_base = Decimal(str(target.sales_target)) if target.sales_target is not None else None
        tb_base = Decimal(str(target.tb_target)) if target.tb_target is not None else None
        emi_base = Decimal(str(target.emi_target)) if getattr(target, "emi_target", None) is not None else None
        dialed_target = target.dialed_calls_target
        connected_target = target.connected_calls_target
        outdoor_target = target.outdoor_visit_target
        meeting_target = Decimal(str(target.meeting_hours_target)) if target.meeting_hours_target is not None else None

        sales_carry_forward = Decimal("0")
        tb_carry_forward = Decimal("0")
        emi_carry_forward = Decimal("0")

        # Calculate carry-forward for employee if date is past start of month
        if employee_id is not None:
            month_start = date(report_date.year, report_date.month, 1)
            eff_start = max(month_start, target.effective_from)
            yesterday = report_date - timedelta(days=1)

            if yesterday >= eff_start:
                past_days = (yesterday - eff_start).days + 1
                exp_sales = (sales_base or Decimal("0")) * past_days
                exp_tb = (tb_base or Decimal("0")) * past_days
                exp_emi = (emi_base or Decimal("0")) * past_days

                # Query actual historical reports in [eff_start, yesterday]
                stmt = (
                    select(DailyActivityReport)
                    .options(selectinload(DailyActivityReport.sales_collection_entries))
                    .where(
                        DailyActivityReport.employee_id == employee_id,
                        DailyActivityReport.report_date >= eff_start,
                        DailyActivityReport.report_date <= yesterday,
                    )
                )
                past_res = await self.db.execute(stmt)
                past_reports = past_res.scalars().all()

                act_sales = Decimal("0")
                act_tb = Decimal("0")
                act_emi = Decimal("0")
                for pr in past_reports:
                    pfin = SalesService.calc_totals(pr.sales_collection_entries)
                    act_sales += pfin["total_new_sales"]
                    act_tb += pfin["total_tb_collection"]
                    act_emi += pfin["total_emi_collection"]

                sales_carry_forward = max(Decimal("0"), exp_sales - act_sales)
                tb_carry_forward = max(Decimal("0"), exp_tb - act_tb)
                emi_carry_forward = max(Decimal("0"), exp_emi - act_emi)

        effective_sales_target = (sales_base + sales_carry_forward) if sales_base is not None else None
        effective_tb_target = (tb_base + tb_carry_forward) if tb_base is not None else None
        effective_emi_target = (emi_base + emi_carry_forward) if emi_base is not None else None

        return {
            "target": target,
            "sales_target": effective_sales_target,
            "sales_base": sales_base,
            "sales_carry_forward": sales_carry_forward,
            "tb_target": effective_tb_target,
            "tb_base": tb_base,
            "tb_carry_forward": tb_carry_forward,
            "emi_target": effective_emi_target,
            "emi_base": emi_base,
            "emi_carry_forward": emi_carry_forward,
            "dialed_target": dialed_target,
            "connected_target": connected_target,
            "outdoor_target": outdoor_target,
            "meeting_target": meeting_target,
            "monthly_sales_target": sales_base * Decimal("30") if sales_base is not None else None,
            "monthly_tb_target": tb_base * Decimal("30") if tb_base is not None else None,
            "monthly_emi_target": emi_base * Decimal("30") if emi_base is not None else None,
        }

    async def get_report_summary(
        self, report_id: int
    ) -> ReportSummary:
        """Compute full summary for one daily report."""
        from sqlalchemy.orm import selectinload

        result = await self.db.execute(
            select(DailyActivityReport)
            .where(DailyActivityReport.id == report_id)
            .options(
                selectinload(DailyActivityReport.employee),
                selectinload(DailyActivityReport.call_entries),
                selectinload(DailyActivityReport.meeting_entries),
                selectinload(DailyActivityReport.sales_collection_entries),
            )
        )
        report = result.scalar_one_or_none()
        if not report:
            return None

        call_entries = report.call_entries
        meeting_entries = report.meeting_entries
        sales_entries = report.sales_collection_entries

        # ── Call totals ───────────────────────────────────────────────────────
        total_dialed = _sum_int(call_entries, "total_dialed")
        total_connected = _sum_int(call_entries, "total_connected")
        total_call_dur = _sum_int(call_entries, "total_duration_minutes")
        call_slot_10 = _sum_int(call_entries, "slot_10am_1pm")
        call_slot_2 = _sum_int(call_entries, "slot_2pm_5pm")
        call_slot_5 = _sum_int(call_entries, "slot_5pm_6pm")

        connection_rate = _calc_rate(total_connected, total_dialed)

        # ── Lead category breakdown ───────────────────────────────────────────
        lead_breakdown = [
            LeadCategoryBreakdown(
                lead_category=e.lead_category,
                total_dialed=e.total_dialed,
                total_connected=e.total_connected,
                total_duration_minutes=e.total_duration_minutes,
                lead_status_hp=e.lead_status_hp,
                lead_status_p=e.lead_status_p,
                lead_status_fub=e.lead_status_fub,
                lead_status_ni=e.lead_status_ni,
            )
            for e in call_entries
        ]

        # ── Meeting totals ────────────────────────────────────────────────────
        # Visit count activities (non-time): activity_type contains "visit" or "CX"
        total_outdoor_visits = 0
        total_indoor_cx = 0
        total_meeting_dur = 0
        for me in meeting_entries:
            s_sum = (me.slot_10am_1pm or 0) + (me.slot_2pm_5pm or 0) + (me.slot_5pm_6pm or 0)
            val = me.total_count if me.total_count is not None else s_sum
            act_lower = (me.activity_type or "").lower()
            if "outdoor_visit" in act_lower or "outdoor visit" in act_lower or ("outdoor" in act_lower and "time" not in act_lower and "minute" not in act_lower):
                total_outdoor_visits += val
            elif "indoor_cx" in act_lower or "indoor cx" in act_lower or "cx" in act_lower or ("indoor" in act_lower and "time" not in act_lower and "minute" not in act_lower):
                total_indoor_cx += val

            dur = me.total_duration_minutes if me.total_duration_minutes is not None else s_sum
            if "time" in act_lower or "duration" in act_lower or "minute" in act_lower:
                total_meeting_dur += dur

        # ── Financial totals ─────────────────────────────────────────────────
        fin = SalesService.calc_totals(sales_entries)

        # ── Targets ───────────────────────────────────────────────────────────
        target_info = await self.get_target_with_carry_forward(
            report.report_date, report.employee_id
        )

        # Call Quota Credit rule:
        # 35 calls reduced per Indoor CX meeting
        # 70 calls reduced per Outdoor site visit
        call_reduction = (total_outdoor_visits * 70) + (total_indoor_cx * 35)
        raw_dialed_target = target_info["dialed_target"]
        if raw_dialed_target is not None:
            adjusted_dialed_target = max(0, raw_dialed_target - call_reduction)
        else:
            adjusted_dialed_target = None

        def ta(actual_int, target_val, base_val=None, cf_val=None, monthly_val=None, reduction_val=None) -> TargetAchievement:
            actual = Decimal(str(actual_int))
            t = Decimal(str(target_val)) if target_val is not None else None
            return TargetAchievement(
                actual=actual,
                target=t,
                achievement_pct=_calc_rate(actual, t) if t else None,
                base_target=Decimal(str(base_val)) if base_val is not None else None,
                carry_forward=Decimal(str(cf_val)) if cf_val is not None else None,
                monthly_target=Decimal(str(monthly_val)) if monthly_val is not None else None,
                call_reduction=reduction_val,
            )

        dialed_ta = ta(
            total_dialed,
            adjusted_dialed_target,
            base_val=raw_dialed_target,
            reduction_val=call_reduction,
        )
        connected_ta = ta(total_connected, target_info["connected_target"])
        visit_ta = ta(total_outdoor_visits, target_info["outdoor_target"])
        sales_actual = fin["total_new_sales"]
        sales_ta = TargetAchievement(
            actual=sales_actual,
            target=target_info["sales_target"],
            achievement_pct=(
                _calc_rate(sales_actual, target_info["sales_target"])
                if target_info["sales_target"] else None
            ),
            base_target=target_info["sales_base"],
            carry_forward=target_info["sales_carry_forward"],
            monthly_target=target_info["monthly_sales_target"],
        )
        tb_actual = fin["total_tb_collection"]
        tb_ta = TargetAchievement(
            actual=tb_actual,
            target=target_info["tb_target"],
            achievement_pct=(
                _calc_rate(tb_actual, target_info["tb_target"])
                if target_info["tb_target"] else None
            ),
            base_target=target_info["tb_base"],
            carry_forward=target_info["tb_carry_forward"],
            monthly_target=target_info["monthly_tb_target"],
        )
        emi_actual = fin["total_emi_collection"]
        emi_ta = TargetAchievement(
            actual=emi_actual,
            target=target_info["emi_target"],
            achievement_pct=(
                _calc_rate(emi_actual, target_info["emi_target"])
                if target_info["emi_target"] else None
            ),
            base_target=target_info["emi_base"],
            carry_forward=target_info["emi_carry_forward"],
            monthly_target=target_info["monthly_emi_target"],
        )
        meeting_actual_h = Decimal(str(total_meeting_dur)) / Decimal("60")
        meeting_ta = TargetAchievement(
            actual=meeting_actual_h.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
            target=target_info["meeting_target"],
            achievement_pct=(
                _calc_rate(meeting_actual_h, target_info["meeting_target"])
                if target_info["meeting_target"] else None
            ),
        )

        return ReportSummary(
            report_id=report.id,
            report_date=report.report_date,
            employee_id=report.employee_id,
            employee_name=report.employee.full_name if report.employee else None,
            total_dialed=total_dialed,
            total_connected=total_connected,
            connection_rate_pct=connection_rate,
            total_call_duration_minutes=total_call_dur,
            call_slots=SlotBreakdown(
                slot_10am_1pm=call_slot_10,
                slot_2pm_5pm=call_slot_2,
                slot_5pm_6pm=call_slot_5,
            ),
            total_outdoor_visits=total_outdoor_visits,
            total_meeting_duration_minutes=total_meeting_dur,
            total_new_sales=fin["total_new_sales"],
            total_actual_collection=fin["total_actual_collection"],
            total_sales_commitments=fin["total_sales_commitments"],
            total_tb_collection=fin["total_tb_collection"],
            total_tb_commitments=fin["total_tb_commitments"],
            total_emi_collection=fin["total_emi_collection"],
            total_emi_commitments=fin.get("total_emi_commitments", Decimal("0")),
            dialed_calls=dialed_ta,
            connected_calls=connected_ta,
            outdoor_visits=visit_ta,
            sales=sales_ta,
            tb=tb_ta,
            emi=emi_ta,
            meeting_hours=meeting_ta,
            lead_category_breakdown=lead_breakdown,
        )

    async def get_dashboard_summary(
        self,
        date_from: date,
        date_to: date,
        employee_id: Optional[int] = None,
    ) -> DashboardSummary:
        """Aggregate across multiple reports for the dashboard."""
        from sqlalchemy.orm import selectinload

        stmt = (
            select(DailyActivityReport)
            .options(
                selectinload(DailyActivityReport.call_entries),
                selectinload(DailyActivityReport.meeting_entries),
                selectinload(DailyActivityReport.sales_collection_entries),
            )
            .where(
                DailyActivityReport.report_date >= date_from,
                DailyActivityReport.report_date <= date_to,
            )
        )
        if employee_id is not None:
            stmt = stmt.where(DailyActivityReport.employee_id == employee_id)

        result = await self.db.execute(stmt)
        reports = result.scalars().all()

        total_dialed = 0
        total_connected = 0
        total_call_dur = 0
        total_outdoor_visits = 0
        total_indoor_cx = 0
        total_meeting_dur = 0
        submitted_reports = 0

        slot_breakdown: dict[str, dict[str, int]] = {
            "10_to_1": {"dialed": 0},
            "2_to_5": {"dialed": 0},
            "5_to_6": {"dialed": 0},
        }

        agg_fin: dict[str, Decimal] = {
            "total_new_sales": Decimal("0"),
            "total_actual_collection": Decimal("0"),
            "total_sales_commitments": Decimal("0"),
            "total_tb_collection": Decimal("0"),
            "total_tb_commitments": Decimal("0"),
            "total_emi_collection": Decimal("0"),
            "total_emi_commitments": Decimal("0"),
        }
        category_map: dict[str, LeadCategoryBreakdown] = {}
        by_category_dict: dict[str, dict[str, int]] = {}

        for report in reports:
            if report.status == ReportStatus.SUBMITTED:
                submitted_reports += 1

            for ce in report.call_entries:
                slot1 = ce.slot_10am_1pm or 0
                slot2 = ce.slot_2pm_5pm or 0
                slot3 = ce.slot_5pm_6pm or 0
                ce_hp = ce.lead_status_hp or 0
                ce_p = ce.lead_status_p or 0
                ce_fub = ce.lead_status_fub or 0
                ce_ni = ce.lead_status_ni or 0
                outcomes_conn = ce_hp + ce_p + ce_fub + ce_ni
                ce_connected = ce.total_connected if (ce.total_connected is not None and ce.total_connected >= outcomes_conn) else outcomes_conn
                ce_dialed = max(ce.total_dialed if ce.total_dialed is not None else (slot1 + slot2 + slot3), ce_connected)
                ce_dur = ce.total_duration_minutes or 0

                total_dialed += ce_dialed
                total_connected += ce_connected
                total_call_dur += ce_dur

                slot_breakdown["10_to_1"]["dialed"] += slot1
                slot_breakdown["2_to_5"]["dialed"] += slot2
                slot_breakdown["5_to_6"]["dialed"] += slot3

                cat_stat = by_category_dict.setdefault(
                    ce.lead_category, {"dialed": 0, "connected": 0, "duration_min": 0}
                )
                cat_stat["dialed"] += ce_dialed
                cat_stat["connected"] += ce_connected
                cat_stat["duration_min"] += ce_dur

                lb = category_map.setdefault(
                    ce.lead_category,
                    LeadCategoryBreakdown(lead_category=ce.lead_category),
                )
                _add_opt(lb, "total_dialed", ce_dialed)
                _add_opt(lb, "total_connected", ce_connected)
                _add_opt(lb, "total_duration_minutes", ce_dur)
                _add_opt(lb, "lead_status_hp", ce.lead_status_hp)
                _add_opt(lb, "lead_status_p", ce.lead_status_p)
                _add_opt(lb, "lead_status_fub", ce.lead_status_fub)
                _add_opt(lb, "lead_status_ni", ce.lead_status_ni)

            for me in report.meeting_entries:
                s_sum = (me.slot_10am_1pm or 0) + (me.slot_2pm_5pm or 0) + (me.slot_5pm_6pm or 0)
                val = me.total_count if me.total_count is not None else s_sum
                act_lower = (me.activity_type or "").lower()
                if "outdoor_visit" in act_lower or "outdoor visit" in act_lower or "visit" in act_lower:
                    total_outdoor_visits += val
                elif "indoor_cx" in act_lower or "indoor cx" in act_lower or "cx" in act_lower:
                    total_indoor_cx += val

                dur = me.total_duration_minutes if me.total_duration_minutes is not None else s_sum
                if "time" in act_lower or "duration" in act_lower or "minute" in act_lower:
                    total_meeting_dur += dur

            fin = SalesService.calc_totals(report.sales_collection_entries)
            agg_fin["total_new_sales"] += fin["total_new_sales"]
            agg_fin["total_actual_collection"] += fin["total_actual_collection"]
            agg_fin["total_sales_commitments"] += fin["total_sales_commitments"]
            agg_fin["total_tb_collection"] += fin["total_tb_collection"]
            agg_fin["total_tb_commitments"] += fin["total_tb_commitments"]
            agg_fin["total_emi_collection"] += fin["total_emi_collection"]
            agg_fin["total_emi_commitments"] += fin.get("total_emi_commitments", Decimal("0"))

        tot_commitments = (
            agg_fin["total_sales_commitments"]
            + agg_fin["total_tb_commitments"]
            + agg_fin["total_emi_commitments"]
        )

        return DashboardSummary(
            date_from=date_from,
            date_to=date_to,
            period_start=date_from,
            period_end=date_to,
            employee_id=employee_id,
            report_count=len(reports),
            total_reports=len(reports),
            submitted_reports=submitted_reports,
            total_dialed=total_dialed,
            total_calls_dialed=total_dialed,
            total_connected=total_connected,
            total_calls_connected=total_connected,
            connection_rate_pct=_calc_rate(total_connected, total_dialed),
            total_call_duration_minutes=total_call_dur,
            total_outdoor_visits=total_outdoor_visits,
            total_indoor_cx=total_indoor_cx,
            total_meeting_duration_minutes=total_meeting_dur,
            total_meeting_time_minutes=total_meeting_dur,
            total_new_sales=agg_fin["total_new_sales"],
            total_actual_collection=agg_fin["total_actual_collection"],
            actual_collection_bdt=agg_fin["total_actual_collection"],
            new_sales_collection_bdt=agg_fin["total_new_sales"],
            total_sales_commitments=agg_fin["total_sales_commitments"],
            sales_commitments_bdt=agg_fin["total_sales_commitments"],
            total_tb_collection=agg_fin["total_tb_collection"],
            tb_collection_bdt=agg_fin["total_tb_collection"],
            total_tb_commitments=agg_fin["total_tb_commitments"],
            tb_commitments_bdt=agg_fin["total_tb_commitments"],
            total_emi_collection=agg_fin["total_emi_collection"],
            emi_collection_bdt=agg_fin["total_emi_collection"],
            total_emi_commitments=agg_fin["total_emi_commitments"],
            commitments_bdt=tot_commitments,
            by_slot=slot_breakdown,
            by_category=by_category_dict,
            lead_category_breakdown=list(category_map.values()),
        )

    async def get_performance_leaderboard(
        self,
        date_from: date,
        date_to: date,
        employee_id: Optional[int] = None,
    ) -> PerformanceLeaderboardResponse:
        from app.models.user import User, UserRole

        # 1. Fetch active employees (Executives, Team Leads, Coordinators)
        user_query = select(User).where(User.is_active.is_(True))
        if employee_id:
            user_query = user_query.where(User.id == employee_id)
        else:
            user_query = user_query.where(User.role.in_([UserRole.EMPLOYEE, UserRole.TL, UserRole.CO]))

        users_res = await self.db.execute(user_query.order_by(User.id))
        employees = users_res.scalars().all()

        rankings: list[EmployeeLeaderboardItem] = []

        for emp in employees:
            if date_from == date_to:
                # Single day evaluation: include today's carry forward
                target_info = await self.get_target_with_carry_forward(date_to, emp.id)
                dialed_tgt = target_info["dialed_target"] or 200
                connected_tgt = target_info["connected_target"] or 100
                outdoor_tgt = target_info["outdoor_target"] or 3
                eff_financials = [
                    val for val in [target_info["sales_target"], target_info["tb_target"], target_info["emi_target"]]
                    if val is not None
                ]
                eff_coll_tgt = sum(eff_financials) if eff_financials else None
                collection_tgt = float(eff_coll_tgt if eff_coll_tgt else 33334)

                base_financials = [
                    val for val in [target_info["sales_base"], target_info["tb_base"], target_info["emi_base"]]
                    if val is not None
                ]
                base_coll_tgt = float(sum(base_financials) if base_financials else 0)

                cf_financials = [
                    target_info["sales_carry_forward"],
                    target_info["tb_carry_forward"],
                    target_info["emi_carry_forward"],
                ]
                cf_deficit = float(sum(cf_financials))

                monthly_financials = [
                    val for val in [
                        target_info["monthly_sales_target"],
                        target_info["monthly_tb_target"],
                        target_info["monthly_emi_target"],
                    ]
                    if val is not None
                ]
                monthly_coll_tgt = float(sum(monthly_financials)) if monthly_financials else float(base_coll_tgt * 30)
            else:
                # Multi-day evaluation: calculate expected benchmark for the period
                days_in_period = (date_to - date_from).days + 1
                target = await self.targets_repo.get_effective_target(date_to, emp.id)
                dialed_base = (target.dialed_calls_target if target and target.dialed_calls_target else 200)
                conn_base = (target.connected_calls_target if target and target.connected_calls_target else 100)
                outdoor_base = (target.outdoor_visit_target if target and target.outdoor_visit_target else 3)
                daily_financials = [
                    val for val in [target.sales_target, target.tb_target, getattr(target, "emi_target", None)]
                    if val is not None
                ] if target else []
                daily_coll = float(sum(daily_financials)) if daily_financials else 33334.0

                dialed_tgt = dialed_base * days_in_period
                connected_tgt = conn_base * days_in_period
                outdoor_tgt = outdoor_base * days_in_period
                collection_tgt = daily_coll * days_in_period
                base_coll_tgt = daily_coll
                cf_deficit = 0.0
                monthly_coll_tgt = daily_coll * 30

            summary = await self.get_dashboard_summary(date_from, date_to, emp.id)
            dialed = summary.total_calls_dialed
            connected = summary.total_calls_connected
            visits = summary.total_outdoor_visits
            indoor_cx = summary.total_indoor_cx
            meet_dur = summary.total_meeting_time_minutes
            colls = float(summary.actual_collection_bdt)

            # Meeting Call Quota Credit:
            # -35 calls reduced per indoor customer meeting
            # -70 calls reduced per outdoor site visit
            call_reduction = (visits * 70) + (indoor_cx * 35)
            base_dialed_target = dialed_tgt
            adjusted_dialed_tgt = max(0, dialed_tgt - call_reduction)

            dialed_pct = min(200.0, round((dialed / adjusted_dialed_tgt * 100), 1)) if adjusted_dialed_tgt > 0 else 100.0
            connected_pct = min(200.0, round((connected / connected_tgt * 100), 1)) if connected_tgt > 0 else 100.0
            outdoor_pct = min(200.0, round((visits / outdoor_tgt * 100), 1)) if outdoor_tgt > 0 else 100.0
            colls_pct = min(200.0, round((colls / collection_tgt * 100), 1)) if collection_tgt > 0 else 100.0

            overall = round((dialed_pct * 0.25 + connected_pct * 0.35 + outdoor_pct * 0.20 + colls_pct * 0.20), 1)

            if overall >= 100.0:
                status = "achieved"
            elif overall >= 75.0:
                status = "on_track"
            elif overall >= 50.0:
                status = "needs_attention"
            else:
                status = "behind_pace"

            rankings.append(
                EmployeeLeaderboardItem(
                    rank=0,
                    employee_id=emp.id,
                    employee_name=emp.full_name,
                    username=emp.username,
                    reports_count=summary.total_reports,
                    dialed_calls=dialed,
                    dialed_target=adjusted_dialed_tgt,
                    dialed_pct=dialed_pct,
                    base_dialed_target=base_dialed_target,
                    call_reduction=call_reduction,
                    indoor_cx_count=indoor_cx,
                    connected_calls=connected,
                    connected_target=connected_tgt,
                    connected_pct=connected_pct,
                    outdoor_visits=visits,
                    outdoor_target=outdoor_tgt,
                    outdoor_pct=outdoor_pct,
                    meeting_minutes=meet_dur,
                    actual_collections=colls,
                    collection_target=collection_tgt,
                    collection_pct=colls_pct,
                    overall_score_pct=overall,
                    status=status,
                    base_collection_target=base_coll_tgt,
                    carry_forward_deficit=cf_deficit,
                    monthly_collection_target=monthly_coll_tgt,
                    month_to_date_collected=colls,
                )
            )

        # Sort active performers above inactive ones, then by overall score, collections, connections, dialed calls,
        # and lowest carry-forward deficit as a tie-breaker.
        rankings.sort(
            key=lambda r: (
                1 if r.overall_score_pct > 0 or r.dialed_calls > 0 or r.actual_collections > 0 else 0,
                r.overall_score_pct,
                r.actual_collections,
                r.connected_calls,
                r.dialed_calls,
                -r.carry_forward_deficit if r.carry_forward_deficit is not None else 0.0,
            ),
            reverse=True,
        )
        for idx, item in enumerate(rankings, 1):
            item.rank = idx

        champions: list[KPIChampion] = []
        if rankings and employee_id is None:
            # Only award a champion title if the employee actually has positive activity (> 0)
            callers_with_activity = [r for r in rankings if r.dialed_calls > 0]
            if callers_with_activity:
                top_caller = max(callers_with_activity, key=lambda r: r.dialed_calls)
                champions.append(
                    KPIChampion(
                        title="Top Caller",
                        metric="Most Dialed Calls",
                        employee_name=top_caller.employee_name,
                        value=f"{top_caller.dialed_calls} calls ({top_caller.dialed_pct}%)",
                    )
                )

            conn_with_activity = [r for r in rankings if r.connected_calls > 0]
            if conn_with_activity:
                top_conn = max(conn_with_activity, key=lambda r: r.connected_calls)
                champions.append(
                    KPIChampion(
                        title="Top Connector",
                        metric="Connected Conversations",
                        employee_name=top_conn.employee_name,
                        value=f"{top_conn.connected_calls} connected ({top_conn.connected_pct}%)",
                    )
                )

            visits_with_activity = [r for r in rankings if r.outdoor_visits > 0]
            if visits_with_activity:
                top_visits = max(visits_with_activity, key=lambda r: r.outdoor_visits)
                champions.append(
                    KPIChampion(
                        title="Meeting Star",
                        metric="Client Outdoor Visits",
                        employee_name=top_visits.employee_name,
                        value=f"{top_visits.outdoor_visits} visits ({top_visits.outdoor_pct}%)",
                    )
                )

            closers_with_activity = [r for r in rankings if r.actual_collections > 0]
            if closers_with_activity:
                top_closer = max(closers_with_activity, key=lambda r: r.actual_collections)
                champions.append(
                    KPIChampion(
                        title="Top Closer",
                        metric="Actual Collections",
                        employee_name=top_closer.employee_name,
                        value=f"৳{top_closer.actual_collections:,.0f} ({top_closer.collection_pct}%)",
                    )
                )

        avg_team_score = round(sum(r.overall_score_pct for r in rankings) / len(rankings), 1) if rankings else 0.0

        return PerformanceLeaderboardResponse(
            period_start=date_from,
            period_end=date_to,
            team_overall_score_pct=avg_team_score,
            champions=champions,
            rankings=rankings,
        )

    async def get_financial_trend(
        self,
        date_from: date,
        date_to: date,
        employee_id: Optional[int] = None,
    ) -> FinancialTrendResponse:
        from app.models.user import User, UserRole
        from sqlalchemy.orm import selectinload

        # 1. Monthly target & month-to-date calculation
        month_start = date(date_to.year, date_to.month, 1)
        _, days_in_month = calendar.monthrange(date_to.year, date_to.month)
        days_elapsed = max(1, date_to.day)
        days_remaining = max(0, days_in_month - days_elapsed)

        # Calculate monthly target
        def _calc_monthly_financial_target(t_inf: dict) -> float:
            targets_list = [
                t_inf.get("monthly_sales_target"),
                t_inf.get("monthly_tb_target"),
                t_inf.get("monthly_emi_target"),
            ]
            valid = [float(v) for v in targets_list if v is not None]
            if valid:
                return sum(valid)
            bases_list = [
                t_inf.get("sales_base"),
                t_inf.get("tb_base"),
                t_inf.get("emi_base"),
            ]
            valid_bases = [float(v) for v in bases_list if v is not None]
            if valid_bases:
                return sum(valid_bases) * 30
            return 500000.0 * 30

        if employee_id is not None:
            t_info = await self.get_target_with_carry_forward(date_to, employee_id)
            monthly_target = _calc_monthly_financial_target(t_info)
        else:
            emp_stmt = select(User).where(User.is_active.is_(True), User.role.in_([UserRole.EMPLOYEE, UserRole.TL, UserRole.CO]))
            emp_res = await self.db.execute(emp_stmt)
            active_emps = emp_res.scalars().all()
            monthly_target = 0.0
            for emp in active_emps:
                t_info = await self.get_target_with_carry_forward(date_to, emp.id)
                monthly_target += _calc_monthly_financial_target(t_info)
            if monthly_target <= 0:
                monthly_target = 15000000.0 * max(1, len(active_emps))

        # 2. Month-to-date collected
        mtd_stmt = (
            select(DailyActivityReport)
            .options(selectinload(DailyActivityReport.sales_collection_entries))
            .where(
                DailyActivityReport.report_date >= month_start,
                DailyActivityReport.report_date <= date_to,
            )
        )
        if employee_id is not None:
            mtd_stmt = mtd_stmt.where(DailyActivityReport.employee_id == employee_id)

        mtd_res = await self.db.execute(mtd_stmt)
        mtd_reports = mtd_res.scalars().all()
        month_to_date_collected = 0.0
        for rep in mtd_reports:
            fin = SalesService.calc_totals(rep.sales_collection_entries)
            month_to_date_collected += float(fin["total_actual_collection"])

        # Pace calculations
        expected_pace_pct = round((days_elapsed / days_in_month * 100), 1)
        monthly_pace_pct = (
            round((month_to_date_collected / monthly_target * 100), 1)
            if monthly_target > 0
            else 0.0
        )
        daily_current_run_rate = month_to_date_collected / days_elapsed
        daily_run_rate_needed = (
            max(0.0, (monthly_target - month_to_date_collected) / max(1, days_remaining))
            if days_remaining > 0
            else 0.0
        )
        projected_month_end = month_to_date_collected + (daily_current_run_rate * days_remaining)
        projected_achievement_pct = (
            round((projected_month_end / monthly_target * 100), 1)
            if monthly_target > 0
            else 0.0
        )

        if monthly_pace_pct >= expected_pace_pct * 1.05:
            pace_status = "ahead_of_pace"
        elif monthly_pace_pct >= expected_pace_pct * 0.85:
            pace_status = "on_pace"
        else:
            pace_status = "behind_pace"

        # 3. Period day-by-day trend points (date_from to date_to)
        period_stmt = (
            select(DailyActivityReport)
            .options(selectinload(DailyActivityReport.sales_collection_entries))
            .where(
                DailyActivityReport.report_date >= date_from,
                DailyActivityReport.report_date <= date_to,
            )
        )
        if employee_id is not None:
            period_stmt = period_stmt.where(DailyActivityReport.employee_id == employee_id)

        p_res = await self.db.execute(period_stmt)
        period_reports = p_res.scalars().all()

        # Group by report_date
        by_date_map: dict[date, dict[str, float]] = {}
        for rep in period_reports:
            r_date = rep.report_date
            if r_date not in by_date_map:
                by_date_map[r_date] = {
                    "actual": 0.0,
                    "new_sales": 0.0,
                    "emi": 0.0,
                    "commitments": 0.0,
                }
            fin = SalesService.calc_totals(rep.sales_collection_entries)
            by_date_map[r_date]["actual"] += float(fin["total_actual_collection"])
            by_date_map[r_date]["new_sales"] += float(fin["total_new_sales"])
            by_date_map[r_date]["emi"] += float(fin["total_emi_collection"])
            by_date_map[r_date]["commitments"] += float(
                fin["total_sales_commitments"]
                + fin["total_tb_commitments"]
                + fin.get("total_emi_commitments", Decimal("0"))
            )

        # Generate sequence of dates from date_from to date_to
        total_days = (date_to - date_from).days + 1
        trend_points: list[DailyTrendPoint] = []
        cum_actual = 0.0
        cum_commitments = 0.0
        total_period_actual = 0.0
        total_period_commitments = 0.0
        total_period_new_sales = 0.0
        total_period_emi = 0.0

        for i in range(total_days):
            curr_d = date_from + timedelta(days=i)
            stats = by_date_map.get(
                curr_d,
                {"actual": 0.0, "new_sales": 0.0, "emi": 0.0, "commitments": 0.0},
            )
            act = stats["actual"]
            ns = stats["new_sales"]
            emi = stats["emi"]
            comm = stats["commitments"]

            cum_actual += act
            cum_commitments += comm

            total_period_actual += act
            total_period_commitments += comm
            total_period_new_sales += ns
            total_period_emi += emi

            trend_points.append(
                DailyTrendPoint(
                    date=curr_d.isoformat(),
                    label=curr_d.strftime("%b %d"),
                    actual_collection_bdt=act,
                    new_sales_collection_bdt=ns,
                    emi_collection_bdt=emi,
                    commitments_bdt=comm,
                    cumulative_collection_bdt=cum_actual,
                    cumulative_commitments_bdt=cum_commitments,
                )
            )

        return FinancialTrendResponse(
            period_start=date_from,
            period_end=date_to,
            total_actual_collection_bdt=total_period_actual,
            total_commitments_bdt=total_period_commitments,
            total_new_sales_collection_bdt=total_period_new_sales,
            total_emi_collection_bdt=total_period_emi,
            monthly_target_bdt=monthly_target,
            month_to_date_collected_bdt=month_to_date_collected,
            monthly_pace_pct=monthly_pace_pct,
            expected_pace_pct=expected_pace_pct,
            pace_status=pace_status,
            days_in_month=days_in_month,
            days_elapsed=days_elapsed,
            days_remaining=days_remaining,
            daily_current_run_rate_bdt=daily_current_run_rate,
            daily_run_rate_needed_bdt=daily_run_rate_needed,
            projected_month_end_bdt=projected_month_end,
            projected_achievement_pct=projected_achievement_pct,
            trend=trend_points,
        )


# ── Helpers ───────────────────────────────────────────────────────────────────

def _sum_int(entries, field: str) -> int:
    return sum(getattr(e, field) or 0 for e in entries)


def _calc_rate(numerator, denominator) -> Optional[Decimal]:
    try:
        n = Decimal(str(numerator))
        d = Decimal(str(denominator))
        if d == 0:
            return None
        return (n / d * 100).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except Exception:
        return None


def _add_opt(obj, field: str, value) -> None:
    """Add an optional integer to a LeadCategoryBreakdown field."""
    if value is not None:
        current = getattr(obj, field)
        setattr(obj, field, (current or 0) + value)
