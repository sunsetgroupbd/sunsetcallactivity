"""Model for Admin Milestone Review Sessions (Till 5th, Till 10th, etc.)."""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base


class MilestoneCheckpoint(Base):
    """
    Stores manual/session milestone checkpoint data entered by Admin for
    specific intervals (e.g. Till 5th, Till 10th, Till 15th, Till 20th, Till 25th, Till 30th).

    Can be:
      - Company-Wide: employee_id is NULL
      - Per-Employee: employee_id references users.id
    """
    __tablename__ = "milestone_checkpoints"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    month: Mapped[str] = mapped_column(String(7), nullable=False, index=True)  # "YYYY-MM"
    
    # Nullable: None represents Company-Wide aggregate review session
    employee_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    checkpoint_day: Mapped[int] = mapped_column(Integer, nullable=False)  # 5, 10, 15, 20, 25, 30, 31
    label: Mapped[str] = mapped_column(String(50), nullable=False)  # "Till 5th", etc.

    # Financial Metrics
    new_sales: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0.00"), nullable=False)
    emi: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0.00"), nullable=False)
    total_collection: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0.00"), nullable=False)

    # Activity & Lead Metrics
    total_lead: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    fair_lead: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    fb_lead: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    hp: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    p: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    fup: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    outdoor_visits: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    indoor_cx: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Session remarks / evaluation notes
    admin_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Auditing
    updated_by_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Relationships
    employee = relationship("User", foreign_keys=[employee_id])
    updated_by = relationship("User", foreign_keys=[updated_by_id])

