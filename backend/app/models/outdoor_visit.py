"""OutdoorVisitLog model — client/site visits and real estate fair visits."""
from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.report import DailyActivityReport
    from app.models.user import User

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base


class OutdoorVisitLog(Base):
    """
    Log of an outdoor activity: either a client/site visit or fair visit.
    Tracks departure time, return time, total duration, and presence status.
    """

    __tablename__ = "outdoor_visit_logs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    report_id: Mapped[int | None] = mapped_column(
        ForeignKey("daily_activity_reports.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    visit_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    visit_type: Mapped[str] = mapped_column(
        String(50), default="client_site", nullable=False, index=True
    )  # "client_site" | "fair"
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)  # Fair Name or Client/Site
    departure_time: Mapped[str | None] = mapped_column(String(20), nullable=True)  # e.g. "11:00 AM"
    return_time: Mapped[str | None] = mapped_column(String(20), nullable=True)  # e.g. "04:30 PM"
    duration_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[str] = mapped_column(
        String(50), default="completed", nullable=False
    )  # "in_progress" | "completed"
    is_present: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    employee: Mapped[User] = relationship("User", foreign_keys=[employee_id])
    report: Mapped[DailyActivityReport | None] = relationship(
        "DailyActivityReport", foreign_keys=[report_id]
    )

    def __repr__(self) -> str:
        return (
            f"<OutdoorVisitLog id={self.id} emp={self.employee_id} date={self.visit_date} "
            f"type={self.visit_type!r} status={self.status!r}>"
        )
