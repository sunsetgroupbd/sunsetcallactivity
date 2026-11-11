"""ReportRepository — database access for DailyActivityReport."""
from __future__ import annotations

from datetime import date
from typing import Optional, Sequence

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.report import DailyActivityReport, ReportStatus
from app.models.user import User, UserRole


class ReportRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_by_id(
        self, report_id: int, load_employee: bool = True
    ) -> Optional[DailyActivityReport]:
        stmt = select(DailyActivityReport).where(DailyActivityReport.id == report_id)
        if load_employee:
            stmt = stmt.options(selectinload(DailyActivityReport.employee))
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_employee_and_date(
        self, employee_id: int, report_date: date, load_employee: bool = True
    ) -> Optional[DailyActivityReport]:
        stmt = select(DailyActivityReport).where(
            DailyActivityReport.employee_id == employee_id,
            DailyActivityReport.report_date == report_date,
        )
        if load_employee:
            stmt = stmt.options(selectinload(DailyActivityReport.employee))
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_reports(
        self,
        employee_id: Optional[int] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        status: Optional[ReportStatus] = None,
        skip: int = 0,
        limit: int = 50,
        load_employee: bool = True,
    ) -> Sequence[DailyActivityReport]:
        stmt = select(DailyActivityReport)
        if load_employee:
            stmt = stmt.options(selectinload(DailyActivityReport.employee))
        stmt = self._apply_filters(stmt, employee_id, date_from, date_to, status)
        stmt = stmt.order_by(DailyActivityReport.report_date.desc()).offset(skip).limit(limit)
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def count_reports(
        self,
        employee_id: Optional[int] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        status: Optional[ReportStatus] = None,
    ) -> int:
        stmt = select(func.count(DailyActivityReport.id))
        stmt = self._apply_filters(stmt, employee_id, date_from, date_to, status)
        result = await self.db.execute(stmt)
        return result.scalar_one()

    def _apply_filters(self, stmt, employee_id, date_from, date_to, status):
        if employee_id is not None:
            stmt = stmt.where(DailyActivityReport.employee_id == employee_id)
        else:
            # Exclude administrator and sub-administrator accounts from general reports log
            stmt = stmt.join(User, DailyActivityReport.employee_id == User.id).where(
                User.role.notin_([UserRole.ADMIN, UserRole.SUB_ADMIN])
            )
        if date_from is not None:
            stmt = stmt.where(DailyActivityReport.report_date >= date_from)
        if date_to is not None:
            stmt = stmt.where(DailyActivityReport.report_date <= date_to)
        if status is not None:
            stmt = stmt.where(DailyActivityReport.status == status)
        return stmt

    async def create(self, report: DailyActivityReport) -> DailyActivityReport:
        self.db.add(report)
        await self.db.flush()
        fresh = await self.get_by_id(report.id, load_employee=True)
        return fresh if fresh is not None else report

    async def update(self, report: DailyActivityReport) -> DailyActivityReport:
        self.db.add(report)
        await self.db.flush()
        fresh = await self.get_by_id(report.id, load_employee=True)
        return fresh if fresh is not None else report

    async def delete(self, report: DailyActivityReport) -> None:
        await self.db.delete(report)
        await self.db.flush()
