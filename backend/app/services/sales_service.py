"""
SalesService — business logic and calculations for sales/collection entries.

FINANCIAL RULES (documented):
  actual_collection_categories: amounts that represent money physically collected today.
    - new_sales_collection
    - tb_collection
    - emi_collection

  commitment_categories: promises of future payment — NEVER add to actual collections.
    - new_sales_commit_payment, new_sales_commit_payment_2, new_sales_commit_payment_3
    - total_token_to_booking_commit, total_token_to_booking_commit_2, total_token_to_booking_commit_3

  sales_categories: booked/contracted sales (separate from cash collected).
    - total_sales
    - new_sales

All amounts in BDT using Python Decimal arithmetic.
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Optional, Sequence

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.report import DailyActivityReport, ReportStatus
from app.models.sales_collection import SalesCollectionEntry
from app.models.user import User, UserRole
from app.repositories.report_repo import ReportRepository
from app.repositories.sales_repo import SalesCollectionRepository
from app.schemas.sales_collection import (
    CommitmentItemRead,
    CommitmentPipelineResponse,
    SalesCollectionEntryCreate,
    SalesCollectionEntryUpdate,
)

# Stable category keys — display labels come from AppSettings
ACTUAL_COLLECTION_CATEGORIES = {
    "new_sales_collection",
    "tb_collection",
    "emi_collection",
    "other_collection",
}
COMMITMENT_CATEGORIES = {
    "new_sales_commit_payment",
    "new_sales_commit_payment_1",
    "new_sales_commit_payment_2",
    "new_sales_commit_payment_3",
    "total_token_to_booking_commit",
    "total_token_to_booking_commit_2",
    "total_token_to_booking_commit_3",
    "tb_commit_payment_1",
    "tb_commit_payment_2",
    "tb_commit_payment_3",
    "emi_commit_payment",
    "emi_commit_payment_1",
    "emi_commit_payment_2",
    "emi_commit_payment_3",
}
SALES_CATEGORIES = {"total_sales", "new_sales", "new_sales_collection"}
TB_COLLECTION_CATEGORIES = {"tb_collection"}


class SalesService:
    def __init__(self, db: AsyncSession) -> None:
        self.repo = SalesCollectionRepository(db)
        self.report_repo = ReportRepository(db)

    async def get_entries(
        self, report_id: int, current_user: User
    ) -> Sequence[SalesCollectionEntry]:
        await self._load_and_check_report(report_id, current_user)
        return await self.repo.get_by_report(report_id)

    async def create_entry(
        self,
        report_id: int,
        data: SalesCollectionEntryCreate,
        current_user: User,
    ) -> SalesCollectionEntry:
        report = await self._load_and_check_report(report_id, current_user)
        self._guard_submitted(report, current_user)
        entry = SalesCollectionEntry(
            report_id=report_id,
            **data.model_dump(),
        )
        return await self.repo.create(entry)

    async def update_entry(
        self,
        entry_id: int,
        data: SalesCollectionEntryUpdate,
        current_user: User,
    ) -> SalesCollectionEntry:
        entry = await self.repo.get_by_id(entry_id)
        if not entry:
            raise HTTPException(status_code=404, detail="Entry not found")
        report = await self._load_and_check_report(entry.report_id, current_user)
        self._guard_submitted(report, current_user)

        update_data = data.model_dump(exclude_unset=True)
        reschedule_reason = update_data.pop("reschedule_reason", None)

        # Audit trail: check if expected_payment_date is changing from a previously set date
        if "expected_payment_date" in update_data:
            new_date = update_data["expected_payment_date"]
            old_date = entry.expected_payment_date
            if old_date is not None and new_date is not None and old_date != new_date:
                history = list(entry.reschedule_history or [])
                history.append({
                    "old_date": str(old_date),
                    "new_date": str(new_date),
                    "reason": reschedule_reason.strip() if reschedule_reason else "Date shifted by client",
                    "changed_at": datetime.now(timezone.utc).isoformat(),
                    "changed_by": current_user.full_name or current_user.username,
                })
                entry.reschedule_history = history
                entry.reschedule_count = len(history)

        for field, value in update_data.items():
            setattr(entry, field, value)
        return await self.repo.update(entry)

    async def delete_entry(self, entry_id: int, current_user: User) -> None:
        entry = await self.repo.get_by_id(entry_id)
        if not entry:
            raise HTTPException(status_code=404, detail="Entry not found")
        report = await self._load_and_check_report(entry.report_id, current_user)
        self._guard_submitted(report, current_user)
        await self.repo.delete(entry)

    async def get_commitments_pipeline(
        self,
        current_user: User,
        employee_id: Optional[int] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
    ) -> CommitmentPipelineResponse:
        target_emp_id = None
        if current_user.role in (UserRole.ADMIN, UserRole.SUB_ADMIN):
            target_emp_id = employee_id
        else:
            target_emp_id = current_user.id

        today = date.today()
        rows = await self.repo.get_commitments(
            employee_id=target_emp_id,
            date_from=date_from,
            date_to=date_to,
            commitment_categories=COMMITMENT_CATEGORIES,
        )

        items: list[CommitmentItemRead] = []
        total_promised = Decimal("0")
        rescheduled_count = 0

        for entry, rep, emp in rows:
            status = "upcoming"
            if entry.expected_payment_date:
                if entry.expected_payment_date < today:
                    status = "overdue"
                elif entry.expected_payment_date == today:
                    status = "due_today"
                else:
                    status = "upcoming"
            else:
                status = "no_date"

            if entry.reschedule_count and entry.reschedule_count > 0:
                rescheduled_count += 1

            total_promised += Decimal(str(entry.amount or 0))

            items.append(
                CommitmentItemRead(
                    id=entry.id,
                    report_id=entry.report_id,
                    report_date=rep.report_date,
                    employee_id=emp.id,
                    employee_name=emp.full_name,
                    category=entry.category,
                    amount=Decimal(str(entry.amount)),
                    customer_name=entry.customer_name,
                    customer_phone=entry.customer_phone,
                    expected_payment_date=entry.expected_payment_date,
                    commitment_percentage=entry.commitment_percentage,
                    reschedule_count=entry.reschedule_count or 0,
                    reschedule_history=entry.reschedule_history,
                    payment_method=entry.payment_method,
                    reference=entry.reference,
                    notes=entry.notes,
                    status=status,
                )
            )

        return CommitmentPipelineResponse(
            total_promised_amount=total_promised,
            total_commitments=len(items),
            rescheduled_count=rescheduled_count,
            items=items,
        )

    # ── Financial calculation helpers (reused by dashboard service) ──────────

    @staticmethod
    def calc_totals(
        entries: Sequence[SalesCollectionEntry],
    ) -> dict[str, Decimal]:
        """
        Compute financial totals from a list of SalesCollectionEntry rows.
        Returns a dict with:
          total_new_sales         — sum of new_sales category
          total_actual_collection — sum of actual collection categories (cash in)
          total_sales_commitments — sum of new-sales commitment categories
          total_tb_commitments    — sum of token-to-booking commitment categories
        """
        totals: dict[str, Decimal] = {
            "total_new_sales": Decimal("0.00"),
            "total_actual_collection": Decimal("0.00"),
            "total_sales_commitments": Decimal("0.00"),
            "total_tb_collection": Decimal("0.00"),
            "total_tb_commitments": Decimal("0.00"),
            "total_emi_collection": Decimal("0.00"),
            "total_emi_commitments": Decimal("0.00"),
        }
        for entry in entries:
            cat = entry.category
            amount = Decimal(str(entry.amount))
            if cat in SALES_CATEGORIES:
                totals["total_new_sales"] += amount
            if cat in ACTUAL_COLLECTION_CATEGORIES:
                totals["total_actual_collection"] += amount
            if cat in TB_COLLECTION_CATEGORIES:
                totals["total_tb_collection"] += amount
            if cat == "emi_collection":
                totals["total_emi_collection"] += amount
            if cat in COMMITMENT_CATEGORIES:
                if cat.startswith("new_sales"):
                    totals["total_sales_commitments"] += amount
                elif cat.startswith("emi"):
                    totals["total_emi_commitments"] += amount
                else:
                    totals["total_tb_commitments"] += amount
        return totals

    async def _load_and_check_report(
        self, report_id: int, current_user: User
    ) -> DailyActivityReport:
        report = await self.report_repo.get_by_id(report_id)
        if not report:
            raise HTTPException(status_code=404, detail="Report not found")
        if current_user.role not in (UserRole.ADMIN, UserRole.SUB_ADMIN) and report.employee_id != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied")
        return report

    @staticmethod
    def _guard_submitted(report: DailyActivityReport, user: User) -> None:
        if report.status == ReportStatus.SUBMITTED and user.role not in (UserRole.ADMIN, UserRole.SUB_ADMIN):
            raise HTTPException(
                status_code=403, detail="Cannot edit entries in a submitted report."
            )
