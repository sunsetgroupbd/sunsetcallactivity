"""Executive Wise Collection Report Service."""
from __future__ import annotations

import calendar
from datetime import date
from typing import Dict, List, Optional, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.report import DailyActivityReport
from app.models.sales_collection import SalesCollectionEntry
from app.models.targets import DailyTargets
from app.models.team import Team
from app.models.user import User, UserRole
from app.schemas.executive_collection_report import (
    COGroup,
    ExecutiveCollectionReportResponse,
    ExecutiveCollectionRow,
    TeamGroup,
)


class ExecutiveCollectionService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_report_data(
        self,
        report_date: Optional[date] = None,
        team_id: Optional[int] = None,
    ) -> ExecutiveCollectionReportResponse:
        target_date = report_date or date.today()
        month_start = date(target_date.year, target_date.month, 1)
        month_name = calendar.month_name[target_date.month]
        month_display = f"{month_name} {target_date.year}"
        date_display = target_date.strftime("%d.%m.%y")
        date_range_label = f"01-{target_date.day:02d} {target_date.strftime('%b')}. Achived"

        # 1. Fetch Teams
        teams_stmt = select(Team).where(Team.is_active.is_(True)).order_by(Team.display_order.asc(), Team.name.asc())
        if team_id:
            teams_stmt = teams_stmt.where(Team.id == team_id)
        teams_res = await self.db.execute(teams_stmt)
        teams = list(teams_res.scalars().all())

        # 2. Fetch Users (Exclude system Admin and Sub-Admin accounts)
        users_stmt = (
            select(User)
            .options(
                selectinload(User.team),
                selectinload(User.reporting_manager),
            )
            .where(
                User.is_active.is_(True),
                User.role.notin_([UserRole.ADMIN, UserRole.SUB_ADMIN]),
            )
            .order_by(User.full_name.asc())
        )
        if team_id:
            users_stmt = users_stmt.where(User.team_id == team_id)
        users_res = await self.db.execute(users_stmt)
        all_users = list(users_res.scalars().all())
        user_map: Dict[int, User] = {u.id: u for u in all_users}
        emp_ids = [u.id for u in all_users]

        # 3. Fetch Targets for active period
        target_map: Dict[int, float] = {}
        if emp_ids:
            targets_stmt = (
                select(DailyTargets)
                .where(
                    DailyTargets.employee_id.in_(emp_ids),
                    DailyTargets.effective_from <= target_date,
                )
                .order_by(DailyTargets.effective_from.desc())
            )
            targets_res = await self.db.execute(targets_stmt)
            for t in targets_res.scalars().all():
                if t.employee_id is not None and t.employee_id not in target_map:
                    s_tgt = float(t.sales_target or 0.0)
                    e_tgt = float(t.emi_target or 0.0)
                    target_map[t.employee_id] = s_tgt if s_tgt > 0.0 else (s_tgt + e_tgt)

        # 4. Fetch Daily Reports and Sales Collection Entries for Month-to-Date
        emp_new_sales: Dict[int, float] = {uid: 0.0 for uid in emp_ids}
        emp_emi: Dict[int, float] = {uid: 0.0 for uid in emp_ids}
        emp_token_count: Dict[int, int] = {uid: 0 for uid in emp_ids}
        emp_sold_shares: Dict[int, int] = {uid: 0 for uid in emp_ids}
        emp_customers: Dict[int, set[str]] = {uid: set() for uid in emp_ids}

        if emp_ids:
            rep_stmt = (
                select(DailyActivityReport)
                .options(selectinload(DailyActivityReport.sales_collection_entries))
                .where(
                    DailyActivityReport.employee_id.in_(emp_ids),
                    DailyActivityReport.report_date >= month_start,
                    DailyActivityReport.report_date <= target_date,
                )
            )
            rep_res = await self.db.execute(rep_stmt)
            for report in rep_res.scalars().all():
                eid = report.employee_id
                for se in report.sales_collection_entries:
                    cat = (se.category or "").lower()
                    amt = float(se.amount or 0.0)
                    cname = (se.customer_name or "").strip()
                    if cname:
                        emp_customers.setdefault(eid, set()).add(cname)

                    if "new_sales" in cat:
                        if "commit" not in cat and "payment" not in cat:
                            emp_new_sales[eid] = emp_new_sales.get(eid, 0.0) + amt
                    elif "emi" in cat:
                        emp_emi[eid] = emp_emi.get(eid, 0.0) + amt
                    elif "tb" in cat or "token" in cat:
                        emp_token_count[eid] = emp_token_count.get(eid, 0) + 1

        # Build raw row for each user
        user_rows: Dict[int, ExecutiveCollectionRow] = {}
        for u in all_users:
            new_s = round(emp_new_sales.get(u.id, 0.0), 2)
            emi_s = round(emp_emi.get(u.id, 0.0), 2)
            tot_coll = round(new_s + emi_s, 2)
            tgt = round(target_map.get(u.id, 0.0), 2)
            achieved = tot_coll  # In sheet, achieved = total collection in that period
            ach_pct = round((achieved / tgt) * 100, 1) if tgt > 0.0 else 0.0
            dues = round(tgt - achieved, 2) if tgt > achieved else 0.0
            client_c = u.client_count if u.client_count > 0 else len(emp_customers.get(u.id, set()))

            pos = u.designation or (u.role.value.replace("_", " ").title() if u.role else "")

            user_rows[u.id] = ExecutiveCollectionRow(
                employee_id=u.id,
                name=u.full_name,
                position=pos,
                is_manager=u.role in (UserRole.TL, UserRole.CO, UserRole.ADMIN, UserRole.SUB_ADMIN),
                client=client_c,
                share=u.client_share_count,
                mgt_given_target=tgt,
                achieved=achieved,
                achievement_pct=ach_pct,
                dues=dues,
                token=emp_token_count.get(u.id, 0),
                sold_share=emp_sold_shares.get(u.id, 0),
                new_sales=new_s,
                emi=emi_s,
                total_collection=tot_coll,
            )

        # 5. Group into Teams and C.O.s
        team_members_map: Dict[Optional[int], List[User]] = {}
        for u in all_users:
            team_members_map.setdefault(u.team_id, []).append(u)

        team_groups: List[TeamGroup] = []

        # Process declared teams in order
        all_team_entries: List[Tuple[Optional[int], str, Optional[str]]] = [
            (t.id, t.name, t.director_name) for t in teams
        ]
        # Include users without a team if any exist
        if None in team_members_map and team_members_map[None]:
            all_team_entries.append((None, "Unassigned", None))

        for tid, tname, director in all_team_entries:
            members = team_members_map.get(tid, [])
            if not members:
                continue

            # If this is Unassigned, do not create artificial C.O. groups.
            # List all unassigned staff sequentially in one clean table.
            if tid is None:
                unassigned_rows: List[ExecutiveCollectionRow] = []
                for idx, m in enumerate(members, start=1):
                    if m.id in user_rows:
                        r = user_rows[m.id].model_copy()
                        r.sl_no = idx
                        unassigned_rows.append(r)

                if unassigned_rows:
                    group_total = self._sum_rows(unassigned_rows, label="Unassigned Total")
                    team_groups.append(
                        TeamGroup(
                            team_id=None,
                            team_name="Unassigned Staff",
                            director_name=None,
                            co_groups=[
                                COGroup(
                                    co_id=None,
                                    co_name="Unassigned Staff (Assign Team in Employees Page)",
                                    co_designation="",
                                    rows=unassigned_rows,
                                    totals=group_total,
                                )
                            ],
                            totals=group_total,
                        )
                    )
                continue

            # For declared teams:
            # Group members by C.O. (reporting_manager_id)
            co_buckets: Dict[Optional[int], List[User]] = {}
            for m in members:
                co_buckets.setdefault(m.reporting_manager_id, []).append(m)

            # A C.O. is someone who actually has team members reporting to them,
            # or has the explicit role TL or CO
            co_manager_ids: List[int] = [
                cid for cid, subs in co_buckets.items() if cid is not None and len(subs) > 0
            ]
            for m in members:
                if m.role in (UserRole.TL, UserRole.CO) and m.id not in co_manager_ids:
                    co_manager_ids.append(m.id)

            co_groups: List[COGroup] = []
            handled_user_ids = set()

            for co_id in co_manager_ids:
                co_user = user_map.get(co_id)
                co_name = co_user.full_name if co_user else f"C.O. ID #{co_id}"
                co_desig = (
                    (co_user.designation or co_user.role.value.upper())
                    if co_user
                    else "Manager"
                )

                subordinates = co_buckets.get(co_id, [])
                co_rows: List[ExecutiveCollectionRow] = []

                # Put the C.O. as first row if they are in this team and not already handled
                if co_user and co_user.id in user_rows and co_user.team_id == tid:
                    r = user_rows[co_user.id].model_copy()
                    r.is_manager = True
                    co_rows.append(r)
                    handled_user_ids.add(co_user.id)

                # Add subordinates
                for sub in subordinates:
                    if sub.id != co_id and sub.id in user_rows and sub.id not in handled_user_ids:
                        co_rows.append(user_rows[sub.id].model_copy())
                        handled_user_ids.add(sub.id)

                if co_rows:
                    for idx, row in enumerate(co_rows, start=1):
                        row.sl_no = idx

                    co_total = self._sum_rows(co_rows, label="C.O Total")
                    co_groups.append(
                        COGroup(
                            co_id=co_id,
                            co_name=co_name,
                            co_designation=co_desig,
                            rows=co_rows,
                            totals=co_total,
                        )
                    )

            # Any remaining team members without an assigned C.O. in this team
            remaining = [m for m in members if m.id not in handled_user_ids]
            if remaining:
                other_rows: List[ExecutiveCollectionRow] = []
                for idx, rem in enumerate(remaining, start=1):
                    if rem.id in user_rows:
                        r = user_rows[rem.id].model_copy()
                        r.sl_no = idx
                        other_rows.append(r)

                if other_rows:
                    grp_label = "Direct Members Total" if co_groups else f"{tname} Total"
                    co_total = self._sum_rows(other_rows, label=grp_label)
                    co_groups.append(
                        COGroup(
                            co_id=None,
                            co_name=f"{tname} Direct Members" if co_groups else tname,
                            co_designation="",
                            rows=other_rows,
                            totals=co_total,
                        )
                    )

            if co_groups:
                team_rows = [group.totals for group in co_groups]
                team_total = self._sum_rows(team_rows, label=f"{tname} Total")

                team_groups.append(
                    TeamGroup(
                        team_id=tid,
                        team_name=tname,
                        director_name=director,
                        co_groups=co_groups,
                        totals=team_total,
                    )
                )

        # 6. Compute Grand Total across all teams
        all_team_totals = [tg.totals for tg in team_groups]
        grand_total = self._sum_rows(all_team_totals, label="Grand Total")

        return ExecutiveCollectionReportResponse(
            report_date=target_date,
            date_display=date_display,
            month_display=month_display,
            date_range_label=date_range_label,
            teams=team_groups,
            grand_total=grand_total,
        )

    @staticmethod
    def _sum_rows(rows: List[ExecutiveCollectionRow], label: str) -> ExecutiveCollectionRow:
        tot_client = sum(r.client for r in rows)
        tot_share = sum(r.share for r in rows)
        tot_target = round(sum(r.mgt_given_target for r in rows), 2)
        tot_achieved = round(sum(r.achieved for r in rows), 2)
        tot_token = sum(r.token for r in rows)
        tot_sold_share = sum(r.sold_share for r in rows)
        tot_new_sales = round(sum(r.new_sales for r in rows), 2)
        tot_emi = round(sum(r.emi for r in rows), 2)
        tot_collection = round(sum(r.total_collection for r in rows), 2)

        ach_pct = (
            round((tot_achieved / tot_target) * 100, 1)
            if tot_target > 0.0
            else 0.0
        )
        dues = (
            round(tot_target - tot_achieved, 2)
            if tot_target > tot_achieved
            else 0.0
        )

        return ExecutiveCollectionRow(
            name=label,
            position="",
            is_manager=False,
            client=tot_client,
            share=tot_share,
            mgt_given_target=tot_target,
            achieved=tot_achieved,
            achievement_pct=ach_pct,
            dues=dues,
            token=tot_token,
            sold_share=tot_sold_share,
            new_sales=tot_new_sales,
            emi=tot_emi,
            total_collection=tot_collection,
        )
