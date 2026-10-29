"""DailyActivityReport model — one report per employee per date."""
from __future__ import annotations

import enum
from datetime import date, datetime

from sqlalchemy import (
    Date,
    DateTime,
    Enum,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base


class ReportStatus(str, enum.Enum):
    DRAFT = "draft"
    SUBMITTED = "submitted"


class DailyActivityReport(Base):
    __tablename__ = "daily_activity_reports"
    __table_args__ = (
        UniqueConstraint("employee_id", "report_date", name="uq_employee_report_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE", onupdate="CASCADE"), nullable=False, index=True
    )
    report_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[ReportStatus] = mapped_column(
        Enum(ReportStatus, name="reportstatus"),
        default=ReportStatus.DRAFT,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
    submitted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # ── Relationships ─────────────────────────────────────────────────────────
    employee: Mapped["User"] = relationship("User", back_populates="reports")  # noqa: F821
    call_entries: Mapped[list["CallActivityEntry"]] = relationship(  # noqa: F821
        "CallActivityEntry",
        back_populates="report",
        cascade="all, delete-orphan",
        lazy="select",
    )
    meeting_entries: Mapped[list["MeetingActivityEntry"]] = relationship(  # noqa: F821
        "MeetingActivityEntry",
        back_populates="report",
        cascade="all, delete-orphan",
        lazy="select",
    )
    sales_collection_entries: Mapped[list["SalesCollectionEntry"]] = relationship(  # noqa: F821
        "SalesCollectionEntry",
        back_populates="report",
        cascade="all, delete-orphan",
        lazy="select",
    )

    def __repr__(self) -> str:
        return (
            f"<DailyActivityReport id={self.id} "
            f"employee_id={self.employee_id} date={self.report_date}>"
        )
