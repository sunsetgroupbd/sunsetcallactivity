"""Scorecard models — Monthly executive scorecard and customer collection plan."""
from __future__ import annotations

import enum
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    JSON,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base

if TYPE_CHECKING:
    from app.models.sales_collection import SalesCollectionEntry
    from app.models.user import User


class ScorecardStatus(str, enum.Enum):
    DRAFT = "draft"
    CLOSED = "closed"


class MonthlyScorecard(Base):
    """
    Monthly executive scorecard for an individual employee.
    Unique per (employee_id, month), where month is stored as the first day of that month (e.g. 2026-11-01).
    """

    __tablename__ = "monthly_scorecards"
    __table_args__ = (
        UniqueConstraint("employee_id", "month", name="uq_scorecard_employee_month"),
        CheckConstraint("marking >= 0 AND marking <= 100", name="chk_scorecard_marking_range"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Stored as first day of month: YYYY-MM-01
    month: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    status: Mapped[ScorecardStatus] = mapped_column(
        Enum(ScorecardStatus, name="scorecardstatus"),
        default=ScorecardStatus.DRAFT,
        nullable=False,
    )
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    closed_by_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    # ── Executive Inputs & Forecast ───────────────────────────────────────────
    prediction_amount: Mapped[Decimal] = mapped_column(
        Numeric(15, 2), default=Decimal("0.00"), nullable=False
    )
    planned_leave: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    unauthorized_leave: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # ── Supervisor Scoring & Evaluation (Restricted) ─────────────────────────
    sheet_score: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2), nullable=True)
    call_score: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2), nullable=True)
    marking: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    supervisor_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # ── Portfolio Snapshot Fields ─────────────────────────────────────────────
    emi_due_monthly: Mapped[Decimal] = mapped_column(
        Numeric(15, 2), default=Decimal("0.00"), nullable=False
    )
    emi_client_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    emi_hold_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    emi_cancel_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    tb_due_amount: Mapped[Decimal] = mapped_column(
        Numeric(15, 2), default=Decimal("0.00"), nullable=False
    )
    tb_client_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    tb_share_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    tb_hold_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    tb_cancel_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # ── Frozen Snapshot on Month Close ────────────────────────────────────────
    snapshot_data: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # ── Relationships ─────────────────────────────────────────────────────────
    employee: Mapped[User] = relationship("User", foreign_keys=[employee_id], lazy="selectin")
    closed_by: Mapped[Optional[User]] = relationship("User", foreign_keys=[closed_by_id], lazy="selectin")
    customers: Mapped[list[ScorecardCustomer]] = relationship(
        "ScorecardCustomer",
        back_populates="scorecard",
        cascade="all, delete-orphan",
        order_by="ScorecardCustomer.id.asc()",
        lazy="selectin",
    )


class ScorecardCustomer(Base):
    """
    Table 2: Customer collection plan rows for the monthly scorecard.
    """

    __tablename__ = "scorecard_customers"
    __table_args__ = (
        CheckConstraint(
            "collection_probability >= 10 AND collection_probability <= 100",
            name="chk_customer_collection_prob_range",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    scorecard_id: Mapped[int] = mapped_column(
        ForeignKey("monthly_scorecards.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Optional link to commitment entry in sales_collection_entries
    commitment_entry_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("sales_collection_entries.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    customer_name: Mapped[str] = mapped_column(String(255), nullable=False)
    paid_amount: Mapped[Decimal] = mapped_column(
        Numeric(15, 2), default=Decimal("0.00"), nullable=False
    )
    unpaid_amount: Mapped[Decimal] = mapped_column(
        Numeric(15, 2), default=Decimal("0.00"), nullable=False
    )

    collection_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    next_collection_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    next_collection_date_2: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    in_out_plan: Mapped[str] = mapped_column(
        String(100), default="Office / Call", nullable=False
    )
    date_1: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    date_2: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    # Expected Collection Amounts
    new_sales_amount: Mapped[Decimal] = mapped_column(
        Numeric(15, 2), default=Decimal("0.00"), nullable=False
    )
    tb_amount: Mapped[Decimal] = mapped_column(
        Numeric(15, 2), default=Decimal("0.00"), nullable=False
    )
    emi_amount: Mapped[Decimal] = mapped_column(
        Numeric(15, 2), default=Decimal("0.00"), nullable=False
    )
    total_collection: Mapped[Decimal] = mapped_column(
        Numeric(15, 2), default=Decimal("0.00"), nullable=False
    )

    new_lead_status: Mapped[str] = mapped_column(
        String(50), default="P", nullable=False
    )
    # Collection probability in percentage (10 to 100, step 10)
    collection_probability: Mapped[int] = mapped_column(
        Integer, default=50, nullable=False
    )
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # ── Relationships ─────────────────────────────────────────────────────────
    scorecard: Mapped[MonthlyScorecard] = relationship(
        "MonthlyScorecard", back_populates="customers"
    )
    commitment_entry: Mapped[Optional[SalesCollectionEntry]] = relationship(
        "SalesCollectionEntry",
        foreign_keys=[commitment_entry_id],
        lazy="selectin",
    )
