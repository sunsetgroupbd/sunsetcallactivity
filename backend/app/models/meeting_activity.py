"""MeetingActivityEntry model — daily meeting/visit time by activity type."""
from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.report import DailyActivityReport

from sqlalchemy import ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base


class MeetingActivityEntry(Base):
    """
    One row per activity_type per daily report.

    Activity types (configurable via AppSettings):
        - Number of Outdoor Visit     (count, not duration)
        - Outdoor Time                (duration in minutes)
        - No. of Indoor CX            (count)
        - Indoor Time with CX         (duration in minutes)
        - MG Time                     (duration in minutes)
        - Team Meeting Time           (duration in minutes)

    All durations stored as integer minutes. The API layer formats them as
    HH:MM strings where useful. Visit counts are never confused with durations
    because the activity_type label and unit metadata (from AppSettings) make
    this explicit.

    Null vs. zero: NULL means not entered; 0 means explicitly zero.
    """

    __tablename__ = "meeting_activity_entries"
    __table_args__ = (
        UniqueConstraint(
            "report_id", "activity_type", name="uq_meeting_report_activity"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    report_id: Mapped[int] = mapped_column(
        ForeignKey("daily_activity_reports.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Stable activity identifier — display label & unit from AppSettings
    activity_type: Mapped[str] = mapped_column(String(100), nullable=False)

    # Cumulative "till today" value
    till_today_value: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Time slot values
    slot_10am_1pm: Mapped[int | None] = mapped_column(Integer, nullable=True)
    slot_2pm_5pm: Mapped[int | None] = mapped_column(Integer, nullable=True)
    slot_5pm_6pm: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Aggregated totals
    total_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ── Relationship ──────────────────────────────────────────────────────────
    report: Mapped[DailyActivityReport] = relationship(
        "DailyActivityReport", back_populates="meeting_entries"
    )

    def __repr__(self) -> str:
        return (
            f"<MeetingActivityEntry id={self.id} "
            f"report_id={self.report_id} type={self.activity_type!r}>"
        )
