"""Scorecard service — aggregation, Dhaka timezone calculations, and permission enforcement."""
from __future__ import annotations

import calendar
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional, Set, Tuple

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.call_activity import CallActivityEntry
from app.models.meeting_activity import MeetingActivityEntry
from app.models.report import DailyActivityReport
from app.models.sales_collection import SalesCollectionEntry
from app.models.scorecard import MonthlyScorecard, ScorecardCustomer, ScorecardStatus
from app.models.targets import DailyTargets
from app.models.user import User, UserRole
from app.repositories.scorecard_repo import ScorecardRepository
from app.repositories.targets_repo import TargetsRepository
from app.repositories.user_repo import UserRepository
from app.schemas.scorecard import (
    MonthlyScorecardResponse,
    MonthlyScorecardUpdateRequest,
    PortfolioSnapshot,
    ScorecardCustomerCreate,
    ScorecardCustomerRead,
    ScorecardCustomerUpdate,
    ScorecardHeader,
    ScorecardPeriodRow,
    ScorecardTeamItem,
    ScorecardTeamRollupResponse,
)


def get_dhaka_date() -> date:
    """Return current date in Asia/Dhaka (UTC+6)."""
    return (datetime.now(timezone.utc) + timedelta(hours=6)).date()


def format_employee_id(emp_id: int | None, created_at: Optional[datetime] = None) -> str:
    """Format employee ID as 8-digit YYYY#### matching project standard."""
    if not emp_id or emp_id <= 0:
        return ""
    if 20000000 <= emp_id < 30000000:
        year = emp_id // 10000
        seq = emp_id % 10000
        return f"{year}{seq:04d}"
    if 2000000 <= emp_id < 3000000:
        year = emp_id // 1000
        seq = emp_id % 1000
        return f"{year}{seq:04d}"
    year = created_at.year if created_at else 2026
    seq = emp_id % 10000
    return f"{year}{seq:04d}"


class ScorecardService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.repo = ScorecardRepository(db)
        self.user_repo = UserRepository(db)
        self.targets_repo = TargetsRepository(db)

    # ─── Hierarchy & Permission Scoping ───────────────────────────────────────
    async def get_accessible_subordinate_ids(self, supervisor: User) -> Set[int]:
        """
        Recursively find all employee user IDs subordinate to supervisor.
        Excludes ADMIN and SUB_ADMIN roles.
        """
        if supervisor.role in (UserRole.ADMIN, UserRole.SUB_ADMIN):
            # Admin sees all non-admin employees
            stmt = select(User.id).where(
                User.is_active.is_(True),
                User.role.notin_([UserRole.ADMIN, UserRole.SUB_ADMIN]),
            )
            res = await self.db.execute(stmt)
            return set(res.scalars().all())

        visited: Set[int] = set()
        queue: List[int] = [supervisor.id]

        while queue:
            curr_id = queue.pop(0)
            stmt = select(User.id).where(
                User.reporting_manager_id == curr_id,
                User.is_active.is_(True),
                User.role.notin_([UserRole.ADMIN, UserRole.SUB_ADMIN]),
            )
            res = await self.db.execute(stmt)
            child_ids = res.scalars().all()
            for cid in child_ids:
                if cid not in visited:
                    visited.add(cid)
                    queue.append(cid)

        # Include self if supervisor is not admin
        visited.add(supervisor.id)
        return visited

    def check_can_view(self, target_employee_id: int, current_user: User, allowed_ids: Set[int]) -> None:
        """Raise 403 if user cannot view target employee's scorecard."""
        if current_user.role in (UserRole.ADMIN, UserRole.SUB_ADMIN):
            return
        if target_employee_id not in allowed_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to view this scorecard.",
            )

    def is_supervisor_of(self, target_employee_id: int, current_user: User, subordinate_ids: Set[int]) -> bool:
        """Check if current user is admin/sub-admin or an actual supervisor above target employee."""
        if current_user.role in (UserRole.ADMIN, UserRole.SUB_ADMIN):
            return True
        # If user is in subordinate subtree and is NOT the employee themselves
        return (target_employee_id in subordinate_ids) and (current_user.id != target_employee_id)

    # ─── Metric Aggregation Helper ────────────────────────────────────────────
    @staticmethod
    def aggregate_reports_metrics(rep_list: List[DailyActivityReport]) -> Dict[str, Any]:
        """
        Derive scorecard metrics from a list of DailyActivityReports.
        Strict separation: Actual collections vs commitments/expected amounts.
        """
        act_new_sales = Decimal("0.00")
        act_tb = Decimal("0.00")
        act_emi = Decimal("0.00")

        total_lead = 0
        fair_lead = 0
        fb_lead = 0
        hp_total = 0
        p_total = 0
        fup_total = 0
        calls_total = 0
        outdoor_total = 0
        indoor_total = 0

        sold_fair = Decimal("0.00")
        sold_fb = Decimal("0.00")
        sold_other = Decimal("0.00")
        hold_amt = Decimal("0.00")
        cancel_amt = Decimal("0.00")

        for r in rep_list:
            for se in r.sales_collection_entries:
                cat = (se.category or "").lower()
                amt = Decimal(str(se.amount or 0))
                desc = ((se.description or "") + " " + (se.notes or "")).lower()
                source = (se.lead_source or "").lower()

                # ACTUAL CASH COLLECTIONS
                # Categories: new_sales_collection, new_sales, tb_collection, emi_collection
                # Commitments: new_sales_commit_payment*, total_token_to_booking_commit*
                if "commit" in cat or "expected" in cat:
                    # Commitment category — track hold/cancel only, DO NOT sum into actual collections
                    if "hold" in desc:
                        hold_amt += amt
                    if "cancel" in desc:
                        cancel_amt += amt
                    continue

                if "new_sales" in cat:
                    act_new_sales += amt
                    if source == "fair" or "fair" in desc:
                        sold_fair += amt
                    elif source == "facebook" or "fb" in desc or "facebook" in desc:
                        sold_fb += amt
                    else:
                        sold_other += amt
                elif "tb" in cat or "token" in cat:
                    act_tb += amt
                    if source == "fair" or "fair" in desc:
                        sold_fair += amt
                    elif source == "facebook" or "fb" in desc or "facebook" in desc:
                        sold_fb += amt
                    else:
                        sold_other += amt
                elif "emi" in cat:
                    act_emi += amt

                if "hold" in desc:
                    hold_amt += amt
                if "cancel" in desc:
                    cancel_amt += amt

            for ce in r.call_entries:
                cat_name = (ce.lead_category or "").lower()
                s_sum = (ce.slot_10am_1pm or 0) + (ce.slot_2pm_5pm or 0) + (ce.slot_5pm_6pm or 0)
                ce_d = ce.total_dialed if ce.total_dialed is not None else s_sum
                calls_total += ce_d
                total_lead += ce_d

                if "fair" in cat_name:
                    fair_lead += ce_d
                elif "fb" in cat_name or "facebook" in cat_name:
                    fb_lead += ce_d

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
            "tb": act_tb,
            "emi": act_emi,
            "total_collection": act_new_sales + act_tb + act_emi,
            "total_lead": total_lead,
            "fair_lead": fair_lead,
            "fb_lead": fb_lead,
            "hp": hp_total,
            "p": p_total,
            "fup": fup_total,
            "calls_dialed": calls_total,
            "in_done": indoor_total,
            "out_done": outdoor_total,
            "sold_fair": sold_fair,
            "sold_fb": sold_fb,
            "sold_other": sold_other,
            "hold_amount": hold_amt,
            "cancel_amount": cancel_amt,
        }

    # ─── Load Scorecard with Full Periods ─────────────────────────────────────
    async def get_scorecard_detail(
        self,
        employee_id: int,
        month_str: Optional[str],
        current_user: User,
    ) -> MonthlyScorecardResponse:
        """
        Retrieve header, Table 1 (previous months + cumulative checkpoints),
        Table 2 (customer collection plan), and portfolio snapshot.
        """
        # Validate target employee
        emp = await self.user_repo.get_by_id(employee_id)
        if not emp or not emp.is_active:
            raise HTTPException(status_code=404, detail="Employee not found")
        if emp.role in (UserRole.ADMIN, UserRole.SUB_ADMIN):
            raise HTTPException(
                status_code=400,
                detail="Scorecards are not applicable for Administrator roles.",
            )

        # Permission check
        sub_ids = await self.get_accessible_subordinate_ids(current_user)
        self.check_can_view(employee_id, current_user, sub_ids)
        is_supervisor = self.is_supervisor_of(employee_id, current_user, sub_ids)

        # Parse target month
        dhaka_today = get_dhaka_date()
        if month_str and len(month_str) == 7 and "-" in month_str:
            try:
                y, m = map(int, month_str.split("-"))
            except ValueError:
                y, m = dhaka_today.year, dhaka_today.month
        else:
            y, m = dhaka_today.year, dhaka_today.month

        month_first_day = date(y, m, 1)
        num_days = calendar.monthrange(y, m)[1]
        month_last_day = date(y, m, num_days)
        month_formatted = f"{y:04d}-{m:02d}"

        # Fetch or create scorecard row
        scorecard = await self.repo.get_or_create_scorecard(employee_id, month_first_day)

        # If scorecard is closed and has snapshot_data, return frozen snapshot
        if scorecard.status == ScorecardStatus.CLOSED and scorecard.snapshot_data:
            snap = scorecard.snapshot_data
            return MonthlyScorecardResponse(**snap)

        # ── Compute Header ───────────────────────────────────────────────────
        # Determine Supervisor / CO / TL safely without triggering lazy-load I/O
        tl_name = None
        co_name = None
        if emp.reporting_manager_id:
            tl = await self.user_repo.get_by_id(emp.reporting_manager_id)
            if tl:
                tl_name = tl.full_name
                if tl.reporting_manager_id:
                    co = await self.user_repo.get_by_id(tl.reporting_manager_id)
                    if co:
                        co_name = co.full_name
                elif tl.role == UserRole.CO:
                    co_name = tl.full_name

        header = ScorecardHeader(
            employee_id=emp.id,
            employee_formatted_id=format_employee_id(emp.id, emp.created_at),
            employee_name=emp.full_name,
            position=emp.designation or emp.role.value.upper(),
            tl_name=tl_name,
            co_name=co_name,
            team_name=emp.team_name,
            month=month_formatted,
        )

        # ── Compute Table 1 Periods ──────────────────────────────────────────
        periods: List[ScorecardPeriodRow] = []

        # 1. Previous 2 months (e.g. Sep-26, Oct-26 if active is Nov-26)
        if m > 2:
            prev_months = [(y, m - 2), (y, m - 1)]
        elif m == 2:
            prev_months = [(y - 1, 12), (y, 1)]
        else:
            prev_months = [(y - 1, 11), (y - 1, 12)]

        for py, pm in prev_months:
            p_first = date(py, pm, 1)
            p_days = calendar.monthrange(py, pm)[1]
            p_last = date(py, pm, p_days)
            p_label = f"{calendar.month_abbr[pm]}-{str(py)[2:]}"

            # Check if previous month has a closed scorecard with snapshot
            prev_sc = await self.repo.get_by_employee_and_month(employee_id, p_first)
            if prev_sc and prev_sc.status == ScorecardStatus.CLOSED and prev_sc.snapshot_data:
                # Use frozen period row from snapshot
                snap_periods = prev_sc.snapshot_data.get("periods", [])
                matching = next((sp for sp in reversed(snap_periods) if sp.get("row_type") == "checkpoint"), None)
                if matching:
                    periods.append(
                        ScorecardPeriodRow(
                            row_type="previous_month",
                            label=p_label,
                            end_day=p_days,
                            tg_sales=Decimal(str(matching.get("tg_sales", "0.00"))),
                            planned_collection=Decimal(str(matching.get("planned_collection", "0.00"))),
                            planned_new_sales=Decimal(str(matching.get("planned_new_sales", "0.00"))),
                            planned_tb=Decimal(str(matching.get("planned_tb", "0.00"))),
                            planned_emi=Decimal(str(matching.get("planned_emi", "0.00"))),
                            customer_plan_count=matching.get("customer_plan_count", 0),
                            new_sales=Decimal(str(matching.get("new_sales", "0.00"))),
                            tb=Decimal(str(matching.get("tb", "0.00"))),
                            emi=Decimal(str(matching.get("emi", "0.00"))),
                            total_collection=Decimal(str(matching.get("total_collection", "0.00"))),
                            total_lead=matching.get("total_lead", 0),
                            current_fair_lead=matching.get("current_fair_lead", 0),
                            current_fb_lead=matching.get("current_fb_lead", 0),
                            hp=matching.get("hp", 0),
                            p=matching.get("p", 0),
                            fup=matching.get("fup", 0),
                            total_fair_lead=matching.get("total_fair_lead", 0),
                            total_fb_lead=matching.get("total_fb_lead", 0),
                            total_calls_dialed=matching.get("total_calls_dialed", 0),
                            hold_amount=Decimal(str(matching.get("hold_amount", "0.00"))),
                            cancel_amount=Decimal(str(matching.get("cancel_amount", "0.00"))),
                            in_done=matching.get("in_done", 0),
                            out_done=matching.get("out_done", 0),
                            sold_fair=Decimal(str(matching.get("sold_fair", "0.00"))),
                            sold_fb=Decimal(str(matching.get("sold_fb", "0.00"))),
                            sold_other=Decimal(str(matching.get("sold_other", "0.00"))),
                            sheet_score=Decimal(str(prev_sc.sheet_score)) if prev_sc.sheet_score is not None else None,
                            call_score=Decimal(str(prev_sc.call_score)) if prev_sc.call_score is not None else None,
                            marking=prev_sc.marking,
                            planned_leave=prev_sc.planned_leave,
                            unauthorized_leave=prev_sc.unauthorized_leave,
                            prediction_amount=prev_sc.prediction_amount,
                        )
                    )
                    continue

            # Compute from reports for previous month
            p_reports = await self._fetch_reports_in_range(employee_id, p_first, p_last)
            p_metrics = self.aggregate_reports_metrics(p_reports)
            p_target = await self.targets_repo.get_effective_target(p_last, employee_id)
            p_tg_sales = Decimal(str(p_target.sales_target)) if p_target and p_target.sales_target is not None else Decimal("0.00")

            periods.append(
                ScorecardPeriodRow(
                    row_type="previous_month",
                    label=p_label,
                    end_day=p_days,
                    tg_sales=p_tg_sales,
                    new_sales=p_metrics["new_sales"],
                    tb=p_metrics["tb"],
                    emi=p_metrics["emi"],
                    total_collection=p_metrics["total_collection"],
                    total_lead=p_metrics["total_lead"],
                    current_fair_lead=p_metrics["fair_lead"],
                    current_fb_lead=p_metrics["fb_lead"],
                    hp=p_metrics["hp"],
                    p=p_metrics["p"],
                    fup=p_metrics["fup"],
                    total_fair_lead=p_metrics["fair_lead"],
                    total_fb_lead=p_metrics["fb_lead"],
                    total_calls_dialed=p_metrics["calls_dialed"],
                    hold_amount=p_metrics["hold_amount"],
                    cancel_amount=p_metrics["cancel_amount"],
                    in_done=p_metrics["in_done"],
                    out_done=p_metrics["out_done"],
                    sold_fair=p_metrics["sold_fair"],
                    sold_fb=p_metrics["sold_fb"],
                    sold_other=p_metrics["sold_other"],
                    sheet_score=prev_sc.sheet_score if prev_sc else None,
                    call_score=prev_sc.call_score if prev_sc else None,
                    marking=prev_sc.marking if prev_sc else None,
                    planned_leave=prev_sc.planned_leave if prev_sc else 0,
                    unauthorized_leave=prev_sc.unauthorized_leave if prev_sc else 0,
                    prediction_amount=prev_sc.prediction_amount if prev_sc else Decimal("0.00"),
                )
            )

        # 2. Cumulative Checkpoints for Selected Month: Till 5th, Till 10th...
        # Fetch all daily reports for this employee in selected month
        curr_reports = await self._fetch_reports_in_range(employee_id, month_first_day, month_last_day)
        curr_target = await self.targets_repo.get_effective_target(month_last_day, employee_id)
        tg_sales = Decimal(str(curr_target.sales_target)) if curr_target and curr_target.sales_target is not None else Decimal("0.00")

        checkpoint_days = [5, 10, 15, 20, 25, num_days]
        for c_day in checkpoint_days:
            label = f"Till {c_day}th" if c_day < 30 else f"Till {c_day}st" if c_day == 31 else f"Till {c_day}th"
            if c_day == num_days:
                label = f"Till {num_days}th" if num_days == 30 else f"Till {num_days}st"

            cutoff_date = date(y, m, c_day)
            # Filter reports cumulative up to cutoff_date
            rep_subset = [r for r in curr_reports if r.report_date <= cutoff_date]
            c_metrics = self.aggregate_reports_metrics(rep_subset)

            # Aggregate Table 2 Customer Recovery Plans cumulative up to cutoff_date
            matching_custs = []
            for cust in (scorecard.customers or []):
                target_date = cust.collection_date or cust.next_collection_date
                if target_date is not None:
                    if target_date <= cutoff_date:
                        matching_custs.append(cust)
                else:
                    # If undated, include in the final month checkpoint
                    if c_day == num_days:
                        matching_custs.append(cust)

            p_new_sales = sum((c.new_sales_amount or Decimal("0.00")) for c in matching_custs)
            p_tb = sum((c.tb_amount or Decimal("0.00")) for c in matching_custs)
            p_emi = sum((c.emi_amount or Decimal("0.00")) for c in matching_custs)
            p_tot = sum(
                (c.total_collection if c.total_collection and c.total_collection > 0 else (c.new_sales_amount or 0) + (c.tb_amount or 0) + (c.emi_amount or 0))
                for c in matching_custs
            )
            if p_tot == Decimal("0.00") and matching_custs:
                p_tot = sum((c.paid_amount or Decimal("0.00")) for c in matching_custs)

            periods.append(
                ScorecardPeriodRow(
                    row_type="checkpoint",
                    label=label,
                    end_day=c_day,
                    tg_sales=tg_sales,
                    planned_collection=p_tot,
                    planned_new_sales=p_new_sales,
                    planned_tb=p_tb,
                    planned_emi=p_emi,
                    customer_plan_count=len(matching_custs),
                    new_sales=c_metrics["new_sales"],
                    tb=c_metrics["tb"],
                    emi=c_metrics["emi"],
                    total_collection=c_metrics["total_collection"],
                    total_lead=c_metrics["total_lead"],
                    current_fair_lead=c_metrics["fair_lead"],
                    current_fb_lead=c_metrics["fb_lead"],
                    hp=c_metrics["hp"],
                    p=c_metrics["p"],
                    fup=c_metrics["fup"],
                    total_fair_lead=c_metrics["fair_lead"],
                    total_fb_lead=c_metrics["fb_lead"],
                    total_calls_dialed=c_metrics["calls_dialed"],
                    hold_amount=c_metrics["hold_amount"],
                    cancel_amount=c_metrics["cancel_amount"],
                    in_done=c_metrics["in_done"],
                    out_done=c_metrics["out_done"],
                    sold_fair=c_metrics["sold_fair"],
                    sold_fb=c_metrics["sold_fb"],
                    sold_other=c_metrics["sold_other"],
                    sheet_score=scorecard.sheet_score,
                    call_score=scorecard.call_score,
                    marking=scorecard.marking,
                    planned_leave=scorecard.planned_leave,
                    unauthorized_leave=scorecard.unauthorized_leave,
                    prediction_amount=scorecard.prediction_amount,
                )
            )

        # ── Table 2 Customers ─────────────────────────────────────────────────
        cust_reads = [ScorecardCustomerRead.model_validate(c) for c in scorecard.customers]

        # ── Portfolio Snapshot ────────────────────────────────────────────────
        portfolio = PortfolioSnapshot(
            emi_due_monthly=scorecard.emi_due_monthly,
            emi_client_count=scorecard.emi_client_count,
            emi_hold_count=scorecard.emi_hold_count,
            emi_cancel_count=scorecard.emi_cancel_count,
            tb_due_amount=scorecard.tb_due_amount,
            tb_client_count=scorecard.tb_client_count,
            tb_share_count=scorecard.tb_share_count,
            tb_hold_count=scorecard.tb_hold_count,
            tb_cancel_count=scorecard.tb_cancel_count,
        )

        closed_by_name = scorecard.closed_by.full_name if scorecard.closed_by else None

        return MonthlyScorecardResponse(
            id=scorecard.id,
            header=header,
            status=scorecard.status.value,
            closed_at=scorecard.closed_at,
            closed_by_name=closed_by_name,
            prediction_amount=scorecard.prediction_amount,
            planned_leave=scorecard.planned_leave,
            unauthorized_leave=scorecard.unauthorized_leave,
            sheet_score=scorecard.sheet_score,
            call_score=scorecard.call_score,
            marking=scorecard.marking,
            supervisor_notes=scorecard.supervisor_notes,
            portfolio=portfolio,
            periods=periods,
            customers=cust_reads,
            can_edit_marking=is_supervisor,
            can_close=is_supervisor,
        )

    # ─── Update Scorecard ─────────────────────────────────────────────────────
    async def update_scorecard(
        self,
        employee_id: int,
        month_str: str,
        data: MonthlyScorecardUpdateRequest,
        current_user: User,
    ) -> MonthlyScorecardResponse:
        """Update manual forecast, portfolio fields, and supervisor marking."""
        # Parse month
        try:
            y, m = map(int, month_str.split("-"))
            month_first_day = date(y, m, 1)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid month format (expected YYYY-MM)")

        scorecard = await self.repo.get_by_employee_and_month(employee_id, month_first_day)
        if not scorecard:
            scorecard = await self.repo.get_or_create_scorecard(employee_id, month_first_day)

        if scorecard.status == ScorecardStatus.CLOSED:
            raise HTTPException(
                status_code=400,
                detail="Scorecard for this month is closed and locked against edits.",
            )

        sub_ids = await self.get_accessible_subordinate_ids(current_user)
        self.check_can_view(employee_id, current_user, sub_ids)
        is_supervisor = self.is_supervisor_of(employee_id, current_user, sub_ids)

        # Field-level permission check: Only supervisors/admins may edit marking & scoring
        if any(
            v is not None
            for v in [data.marking, data.sheet_score, data.call_score, data.supervisor_notes]
        ):
            if not is_supervisor:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Only a supervisor or admin can update marking and evaluation scores.",
                )

        # Apply updates
        if data.prediction_amount is not None:
            scorecard.prediction_amount = data.prediction_amount
        if data.planned_leave is not None:
            scorecard.planned_leave = data.planned_leave
        if data.unauthorized_leave is not None:
            scorecard.unauthorized_leave = data.unauthorized_leave

        if data.emi_due_monthly is not None:
            scorecard.emi_due_monthly = data.emi_due_monthly
        if data.emi_client_count is not None:
            scorecard.emi_client_count = data.emi_client_count
        if data.emi_hold_count is not None:
            scorecard.emi_hold_count = data.emi_hold_count
        if data.emi_cancel_count is not None:
            scorecard.emi_cancel_count = data.emi_cancel_count

        if data.tb_due_amount is not None:
            scorecard.tb_due_amount = data.tb_due_amount
        if data.tb_client_count is not None:
            scorecard.tb_client_count = data.tb_client_count
        if data.tb_share_count is not None:
            scorecard.tb_share_count = data.tb_share_count
        if data.tb_hold_count is not None:
            scorecard.tb_hold_count = data.tb_hold_count
        if data.tb_cancel_count is not None:
            scorecard.tb_cancel_count = data.tb_cancel_count

        if is_supervisor:
            if data.sheet_score is not None:
                scorecard.sheet_score = data.sheet_score
            if data.call_score is not None:
                scorecard.call_score = data.call_score
            if data.marking is not None:
                scorecard.marking = data.marking
            if data.supervisor_notes is not None:
                scorecard.supervisor_notes = data.supervisor_notes

        await self.repo.update_scorecard(scorecard)
        return await self.get_scorecard_detail(employee_id, month_str, current_user)

    # ─── Close Month / Freeze Snapshot ────────────────────────────────────────
    async def close_scorecard(
        self,
        employee_id: int,
        month_str: str,
        current_user: User,
    ) -> MonthlyScorecardResponse:
        """Freeze and lock scorecard totals into snapshot_data."""
        try:
            y, m = map(int, month_str.split("-"))
            month_first_day = date(y, m, 1)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid month format (expected YYYY-MM)")

        scorecard = await self.repo.get_by_employee_and_month(employee_id, month_first_day)
        if not scorecard:
            scorecard = await self.repo.get_or_create_scorecard(employee_id, month_first_day)

        sub_ids = await self.get_accessible_subordinate_ids(current_user)
        is_supervisor = self.is_supervisor_of(employee_id, current_user, sub_ids)
        if not is_supervisor:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only a supervisor or admin can close a monthly scorecard.",
            )

        if scorecard.status == ScorecardStatus.CLOSED:
            return await self.get_scorecard_detail(employee_id, month_str, current_user)

        # Generate current detail view to capture frozen snapshot
        current_detail = await self.get_scorecard_detail(employee_id, month_str, current_user)

        # Mark closed and save timestamp
        scorecard.status = ScorecardStatus.CLOSED
        scorecard.closed_at = datetime.now(timezone.utc)
        scorecard.closed_by_id = current_user.id

        # Update current detail view with closed status and closed_at
        current_detail.status = ScorecardStatus.CLOSED.value
        current_detail.closed_at = scorecard.closed_at
        current_detail.closed_by_name = current_user.full_name

        # Serialize into JSON-compatible dict
        snapshot_dict = current_detail.model_dump(mode="json")
        scorecard.snapshot_data = snapshot_dict

        await self.repo.update_scorecard(scorecard)
        return await self.get_scorecard_detail(employee_id, month_str, current_user)

    # ─── Customer Plan CRUD ───────────────────────────────────────────────────
    async def add_customer_plan(
        self,
        scorecard_id: int,
        data: ScorecardCustomerCreate,
        current_user: User,
    ) -> ScorecardCustomerRead:
        """Add a customer collection plan row."""
        sc = await self.repo.get_by_id(scorecard_id)
        if not sc:
            raise HTTPException(status_code=404, detail="Scorecard not found")
        if sc.status == ScorecardStatus.CLOSED:
            raise HTTPException(status_code=400, detail="Cannot edit a closed scorecard")

        sub_ids = await self.get_accessible_subordinate_ids(current_user)
        self.check_can_view(sc.employee_id, current_user, sub_ids)

        total_calc = data.new_sales_amount + data.tb_amount + data.emi_amount

        cust = ScorecardCustomer(
            scorecard_id=sc.id,
            commitment_entry_id=data.commitment_entry_id,
            customer_name=data.customer_name,
            paid_amount=data.paid_amount,
            unpaid_amount=data.unpaid_amount,
            collection_date=data.collection_date,
            next_collection_date=data.next_collection_date,
            next_collection_date_2=data.next_collection_date_2,
            in_out_plan=data.in_out_plan,
            date_1=data.date_1,
            date_2=data.date_2,
            new_sales_amount=data.new_sales_amount,
            tb_amount=data.tb_amount,
            emi_amount=data.emi_amount,
            total_collection=total_calc,
            new_lead_status=data.new_lead_status,
            collection_probability=data.collection_probability,
            remarks=data.remarks,
        )
        saved = await self.repo.add_customer(cust)
        # Auto-initialize prediction_amount if it was unset/0
        fresh_sc = await self.repo.get_by_id(sc.id)
        if fresh_sc and fresh_sc.prediction_amount == Decimal("0.00"):
            tot_plan = sum((c.total_collection or Decimal("0.00")) for c in (fresh_sc.customers or []))
            if tot_plan > 0:
                fresh_sc.prediction_amount = tot_plan
                await self.repo.update_scorecard(fresh_sc)
        return ScorecardCustomerRead.model_validate(saved)

    async def update_customer_plan(
        self,
        customer_id: int,
        data: ScorecardCustomerUpdate,
        current_user: User,
    ) -> ScorecardCustomerRead:
        """Update an existing customer collection plan row."""
        cust = await self.repo.get_customer_by_id(customer_id)
        if not cust:
            raise HTTPException(status_code=404, detail="Customer plan row not found")
        sc = await self.repo.get_by_id(cust.scorecard_id)
        if not sc or sc.status == ScorecardStatus.CLOSED:
            raise HTTPException(status_code=400, detail="Cannot edit a closed scorecard")

        sub_ids = await self.get_accessible_subordinate_ids(current_user)
        self.check_can_view(sc.employee_id, current_user, sub_ids)

        update_data = data.model_dump(exclude_unset=True)
        for field_name, val in update_data.items():
            setattr(cust, field_name, val)

        # Recalculate total collection
        cust.total_collection = cust.new_sales_amount + cust.tb_amount + cust.emi_amount
        saved = await self.repo.update_customer(cust)
        return ScorecardCustomerRead.model_validate(saved)

    async def delete_customer_plan(
        self,
        customer_id: int,
        current_user: User,
    ) -> None:
        """Delete a customer plan row."""
        cust = await self.repo.get_customer_by_id(customer_id)
        if not cust:
            raise HTTPException(status_code=404, detail="Customer plan row not found")
        sc = await self.repo.get_by_id(cust.scorecard_id)
        if not sc or sc.status == ScorecardStatus.CLOSED:
            raise HTTPException(status_code=400, detail="Cannot edit a closed scorecard")

        sub_ids = await self.get_accessible_subordinate_ids(current_user)
        self.check_can_view(sc.employee_id, current_user, sub_ids)

        await self.repo.delete_customer(cust)

    # ─── Team Rollup ──────────────────────────────────────────────────────────
    async def get_team_rollup(
        self,
        month_str: Optional[str],
        current_user: User,
    ) -> ScorecardTeamRollupResponse:
        """
        Group > CO > TL > Executive rollup respecting caller's role and hierarchy scope.
        ADMIN and SUB_ADMIN are excluded.
        """
        dhaka_today = get_dhaka_date()
        if month_str and len(month_str) == 7 and "-" in month_str:
            try:
                y, m = map(int, month_str.split("-"))
            except ValueError:
                y, m = dhaka_today.year, dhaka_today.month
        else:
            y, m = dhaka_today.year, dhaka_today.month

        month_first_day = date(y, m, 1)
        num_days = calendar.monthrange(y, m)[1]
        month_last_day = date(y, m, num_days)
        month_formatted = f"{y:04d}-{m:02d}"

        # Scoped subordinates
        allowed_ids = await self.get_accessible_subordinate_ids(current_user)
        if not allowed_ids:
            return ScorecardTeamRollupResponse(
                month=month_formatted,
                total_executives=0,
                total_target=Decimal("0.00"),
                total_new_sales=Decimal("0.00"),
                total_tb=Decimal("0.00"),
                total_emi=Decimal("0.00"),
                total_collection=Decimal("0.00"),
                items=[],
            )

        # Fetch employees
        stmt = (
            select(User)
            .where(
                User.id.in_(list(allowed_ids)),
                User.role.notin_([UserRole.ADMIN, UserRole.SUB_ADMIN]),
                User.is_active.is_(True),
            )
            .options(selectinload(User.team), selectinload(User.reporting_manager))
            .order_by(User.id.asc())
        )
        res = await self.db.execute(stmt)
        employees = res.scalars().all()

        emp_ids = [e.id for e in employees]
        scorecards = await self.repo.get_team_scorecards_by_month(emp_ids, month_first_day)
        sc_map = {sc.employee_id: sc for sc in scorecards}

        # Build in-memory lookup for fast, safe manager/coordinator traversal
        all_users_stmt = select(User).where(User.is_active.is_(True))
        all_u_res = await self.db.execute(all_users_stmt)
        user_lookup = {u.id: u for u in all_u_res.scalars().all()}

        # Reports for active month
        stmt_rep = (
            select(DailyActivityReport)
            .options(
                selectinload(DailyActivityReport.call_entries),
                selectinload(DailyActivityReport.meeting_entries),
                selectinload(DailyActivityReport.sales_collection_entries),
            )
            .where(
                DailyActivityReport.employee_id.in_(emp_ids),
                DailyActivityReport.report_date >= month_first_day,
                DailyActivityReport.report_date <= month_last_day,
            )
        )
        res_rep = await self.db.execute(stmt_rep)
        all_reps = res_rep.scalars().all()
        rep_map: Dict[int, List[DailyActivityReport]] = {e.id: [] for e in employees}
        for r in all_reps:
            rep_map.setdefault(r.employee_id, []).append(r)

        items: List[ScorecardTeamItem] = []
        tot_target = Decimal("0.00")
        tot_new_sales = Decimal("0.00")
        tot_tb = Decimal("0.00")
        tot_emi = Decimal("0.00")
        tot_collection = Decimal("0.00")

        for emp in employees:
            sc = sc_map.get(emp.id)
            reps = rep_map.get(emp.id, [])
            metrics = self.aggregate_reports_metrics(reps)
            target = await self.targets_repo.get_effective_target(month_last_day, emp.id)
            tg_sales = Decimal(str(target.sales_target)) if target and target.sales_target is not None else Decimal("0.00")

            plan_count = len(sc.customers) if sc else 0
            plan_expected = sum((c.total_collection for c in sc.customers), Decimal("0.00")) if sc else Decimal("0.00")

            tot_target += tg_sales
            tot_new_sales += metrics["new_sales"]
            tot_tb += metrics["tb"]
            tot_emi += metrics["emi"]
            tot_collection += metrics["total_collection"]

            tl_name = None
            co_name = None
            if emp.reporting_manager_id:
                tl = user_lookup.get(emp.reporting_manager_id)
                if tl:
                    tl_name = tl.full_name
                    if tl.reporting_manager_id:
                        co = user_lookup.get(tl.reporting_manager_id)
                        if co:
                            co_name = co.full_name
                    elif tl.role == UserRole.CO:
                        co_name = tl.full_name

            items.append(
                ScorecardTeamItem(
                    employee_id=emp.id,
                    employee_formatted_id=format_employee_id(emp.id, emp.created_at),
                    employee_name=emp.full_name,
                    position=emp.designation or emp.role.value.upper(),
                    team_name=emp.team_name,
                    tl_name=tl_name,
                    co_name=co_name,
                    status=sc.status.value if sc else "draft",
                    target_sales=tg_sales,
                    actual_new_sales=metrics["new_sales"],
                    actual_tb=metrics["tb"],
                    actual_emi=metrics["emi"],
                    total_collection=metrics["total_collection"],
                    total_calls=metrics["calls_dialed"],
                    marking=sc.marking if sc else None,
                    prediction_amount=sc.prediction_amount if sc else Decimal("0.00"),
                    customer_plan_count=plan_count,
                    customer_plan_expected_total=plan_expected,
                )
            )

        return ScorecardTeamRollupResponse(
            month=month_formatted,
            total_executives=len(items),
            total_target=tot_target,
            total_new_sales=tot_new_sales,
            total_tb=tot_tb,
            total_emi=tot_emi,
            total_collection=tot_collection,
            items=items,
        )

    # ─── Internal Query Helper ────────────────────────────────────────────────
    async def _fetch_reports_in_range(
        self, employee_id: int, start_d: date, end_d: date
    ) -> List[DailyActivityReport]:
        stmt = (
            select(DailyActivityReport)
            .options(
                selectinload(DailyActivityReport.call_entries),
                selectinload(DailyActivityReport.meeting_entries),
                selectinload(DailyActivityReport.sales_collection_entries),
            )
            .where(
                DailyActivityReport.employee_id == employee_id,
                DailyActivityReport.report_date >= start_d,
                DailyActivityReport.report_date <= end_d,
            )
            .order_by(DailyActivityReport.report_date.asc())
        )
        res = await self.db.execute(stmt)
        return list(res.scalars().all())
