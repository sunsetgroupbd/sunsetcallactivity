"""DailyTargets model — configurable targets with optional employee overrides."""
from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.user import User

from sqlalchemy import Date, DateTime, ForeignKey, Numeric, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base


class DailyTargets(Base):
    """
    Stores business targets.

    - When employee_id is NULL this is the global/default target row.
    - When employee_id is set it overrides the global target for that employee.
    - effective_from marks when this target row becomes active.
    - Targets are looked up by finding the most recent row where
      effective_from <= report_date, preferring the employee-specific row.

    IMPORTANT: Do not invent default target values. Only targets that have been
    explicitly configured by an admin are authoritative. The API distinguishes
    "no target configured" from "target is zero".
    """

    __tablename__ = "daily_targets"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    employee_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE", onupdate="CASCADE"), nullable=True, index=True
    )
    effective_from: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    # All targets nullable — NULL means "not configured" (not zero)
    sales_target: Mapped[float | None] = mapped_column(Numeric(15, 2), nullable=True)
    tb_target: Mapped[float | None] = mapped_column(Numeric(15, 2), nullable=True)
    emi_target: Mapped[float | None] = mapped_column(Numeric(15, 2), nullable=True)
    outdoor_visit_target: Mapped[int | None] = mapped_column(nullable=True)
    dialed_calls_target: Mapped[int | None] = mapped_column(nullable=True)
    connected_calls_target: Mapped[int | None] = mapped_column(nullable=True)
    meeting_hours_target: Mapped[float | None] = mapped_column(
        Numeric(6, 2), nullable=True
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

    # ── Relationship ──────────────────────────────────────────────────────────
    employee: Mapped[User | None] = relationship(
        "User", back_populates="targets"
    )

    def __repr__(self) -> str:
        return (
            f"<DailyTargets id={self.id} "
            f"employee_id={self.employee_id} effective_from={self.effective_from}>"
        )
