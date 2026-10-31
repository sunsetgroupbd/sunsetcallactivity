"""CallActivityEntry model — daily call activity by lead category."""
from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.report import DailyActivityReport

from sqlalchemy import ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base


class CallActivityEntry(Base):
    """
    One row per lead category per daily report.
    Unique constraint prevents duplicate category entries within a report.

    Lead categories (configurable via AppSettings):
        - High Potential
        - Potential
        - Facebook
        - Fair Leads
        - Follow Up
        - Other & Not Reached
        - New Cold Leads

    Lead status columns (HP, P, Fub, NI) labels are configurable by admin.
    Time slots (slot_10am_1pm etc.) are configurable reporting periods;
    the column names are stable identifiers, labels come from AppSettings.

    Null vs. zero: a NULL in an integer column means "not entered / unreported";
    0 means the user explicitly entered zero. The API must preserve this distinction.
    """

    __tablename__ = "call_activity_entries"
    __table_args__ = (
        UniqueConstraint("report_id", "lead_category", name="uq_call_report_category"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    report_id: Mapped[int] = mapped_column(
        ForeignKey("daily_activity_reports.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Stable category identifier — display label comes from AppSettings
    lead_category: Mapped[str] = mapped_column(String(100), nullable=False)

    # "Till today" cumulative status count
    till_today_status: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Time slot counts
    slot_10am_1pm: Mapped[int | None] = mapped_column(Integer, nullable=True)
    slot_2pm_5pm: Mapped[int | None] = mapped_column(Integer, nullable=True)
    slot_5pm_6pm: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Totals (calculated on backend; stored for read performance)
    total_dialed: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_connected: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Lead status breakdown — labels are configurable by admin
    lead_status_hp: Mapped[int | None] = mapped_column(Integer, nullable=True)   # High Potential
    lead_status_p: Mapped[int | None] = mapped_column(Integer, nullable=True)    # Potential
    lead_status_fub: Mapped[int | None] = mapped_column(Integer, nullable=True)  # Follow-Up Booked
    lead_status_ni: Mapped[int | None] = mapped_column(Integer, nullable=True)   # Not Interested

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ── Relationship ──────────────────────────────────────────────────────────
    report: Mapped[DailyActivityReport] = relationship(
        "DailyActivityReport", back_populates="call_entries"
    )

    def __repr__(self) -> str:
        return (
            f"<CallActivityEntry id={self.id} "
            f"report_id={self.report_id} category={self.lead_category!r}>"
        )
