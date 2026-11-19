"""Repository for outdoor_visit_logs."""
from __future__ import annotations

from datetime import date
from typing import Any, Dict, List, Optional, Sequence

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.outdoor_visit import OutdoorVisitLog


class OutdoorVisitRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_by_id(self, log_id: int) -> Optional[OutdoorVisitLog]:
        stmt = (
            select(OutdoorVisitLog)
            .options(selectinload(OutdoorVisitLog.employee))
            .where(OutdoorVisitLog.id == log_id)
        )
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def get_by_date_and_employee(
        self, visit_date: date, employee_id: int
    ) -> Sequence[OutdoorVisitLog]:
        stmt = (
            select(OutdoorVisitLog)
            .options(selectinload(OutdoorVisitLog.employee))
            .where(
                OutdoorVisitLog.visit_date == visit_date,
                OutdoorVisitLog.employee_id == employee_id,
            )
            .order_by(desc(OutdoorVisitLog.created_at))
        )
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def get_by_date(self, visit_date: date) -> Sequence[OutdoorVisitLog]:
        stmt = (
            select(OutdoorVisitLog)
            .options(selectinload(OutdoorVisitLog.employee))
            .where(OutdoorVisitLog.visit_date == visit_date)
            .order_by(desc(OutdoorVisitLog.created_at))
        )
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def get_active_fair_visit(
        self, visit_date: date, employee_id: int
    ) -> Optional[OutdoorVisitLog]:
        """Find an in-progress fair visit for this employee today."""
        stmt = (
            select(OutdoorVisitLog)
            .options(selectinload(OutdoorVisitLog.employee))
            .where(
                OutdoorVisitLog.visit_date == visit_date,
                OutdoorVisitLog.employee_id == employee_id,
                OutdoorVisitLog.visit_type == "fair",
                OutdoorVisitLog.status == "in_progress",
            )
            .order_by(desc(OutdoorVisitLog.created_at))
        )
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def create(self, data: Dict[str, Any]) -> OutdoorVisitLog:
        log = OutdoorVisitLog(**data)
        self.db.add(log)
        await self.db.commit()
        await self.db.refresh(log)
        return log

    async def update(self, log: OutdoorVisitLog, data: Dict[str, Any]) -> OutdoorVisitLog:
        for k, v in data.items():
            setattr(log, k, v)
        await self.db.commit()
        await self.db.refresh(log)
        return log

    async def delete(self, log_id: int) -> bool:
        log = await self.get_by_id(log_id)
        if not log:
            return False
        await self.db.delete(log)
        await self.db.commit()
        return True
