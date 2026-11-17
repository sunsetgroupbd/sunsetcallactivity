"""Scorecard repository — CRUD and persistence operations for monthly scorecards."""
from __future__ import annotations

from datetime import date
from typing import List, Optional

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.scorecard import MonthlyScorecard, ScorecardCustomer, ScorecardStatus


class ScorecardRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_by_employee_and_month(
        self, employee_id: int, month_first_day: date
    ) -> Optional[MonthlyScorecard]:
        """Fetch scorecard by employee and month date (YYYY-MM-01)."""
        stmt = (
            select(MonthlyScorecard)
            .where(
                MonthlyScorecard.employee_id == employee_id,
                MonthlyScorecard.month == month_first_day,
            )
            .options(
                selectinload(MonthlyScorecard.employee),
                selectinload(MonthlyScorecard.closed_by),
                selectinload(MonthlyScorecard.customers).selectinload(
                    ScorecardCustomer.commitment_entry
                ),
            )
        )
        res = await self.db.execute(stmt)
        return res.scalar_one_or_none()

    async def get_by_id(self, scorecard_id: int) -> Optional[MonthlyScorecard]:
        """Fetch scorecard by its ID."""
        stmt = (
            select(MonthlyScorecard)
            .where(MonthlyScorecard.id == scorecard_id)
            .options(
                selectinload(MonthlyScorecard.employee),
                selectinload(MonthlyScorecard.closed_by),
                selectinload(MonthlyScorecard.customers).selectinload(
                    ScorecardCustomer.commitment_entry
                ),
            )
        )
        res = await self.db.execute(stmt)
        return res.scalar_one_or_none()

    async def get_or_create_scorecard(
        self, employee_id: int, month_first_day: date
    ) -> MonthlyScorecard:
        """
        Concurrency-safe lookup or creation of MonthlyScorecard.
        Uses rollback on integrity conflict to ensure a unique row is returned.
        """
        existing = await self.get_by_employee_and_month(employee_id, month_first_day)
        if existing:
            return existing

        sc = MonthlyScorecard(
            employee_id=employee_id,
            month=month_first_day,
            status=ScorecardStatus.DRAFT,
        )
        self.db.add(sc)
        try:
            await self.db.flush()
            created = await self.get_by_employee_and_month(employee_id, month_first_day)
            return created or sc
        except Exception:
            # Check if created in current transaction
            existing = await self.get_by_employee_and_month(employee_id, month_first_day)
            if existing:
                return existing
            raise

    async def update_scorecard(self, scorecard: MonthlyScorecard) -> MonthlyScorecard:
        """Persist updates to a scorecard."""
        await self.db.flush()
        refreshed = await self.get_by_id(scorecard.id)
        return refreshed or scorecard

    async def add_customer(self, customer: ScorecardCustomer) -> ScorecardCustomer:
        """Add a customer collection plan row."""
        self.db.add(customer)
        await self.db.flush()
        await self.db.refresh(customer)
        return customer

    async def get_customer_by_id(self, customer_id: int) -> Optional[ScorecardCustomer]:
        """Get customer plan row by id."""
        stmt = (
            select(ScorecardCustomer)
            .where(ScorecardCustomer.id == customer_id)
            .options(selectinload(ScorecardCustomer.commitment_entry))
        )
        res = await self.db.execute(stmt)
        return res.scalar_one_or_none()

    async def update_customer(self, customer: ScorecardCustomer) -> ScorecardCustomer:
        """Update a customer collection plan row."""
        await self.db.flush()
        await self.db.refresh(customer)
        return customer

    async def delete_customer(self, customer: ScorecardCustomer) -> None:
        """Delete a customer plan row."""
        await self.db.delete(customer)
        await self.db.flush()

    async def get_team_scorecards_by_month(
        self, employee_ids: List[int], month_first_day: date
    ) -> List[MonthlyScorecard]:
        """Fetch scorecards for a list of employees for the given month."""
        if not employee_ids:
            return []
        stmt = (
            select(MonthlyScorecard)
            .where(
                MonthlyScorecard.employee_id.in_(employee_ids),
                MonthlyScorecard.month == month_first_day,
            )
            .options(
                selectinload(MonthlyScorecard.employee),
                selectinload(MonthlyScorecard.customers),
            )
        )
        res = await self.db.execute(stmt)
        return list(res.scalars().all())
