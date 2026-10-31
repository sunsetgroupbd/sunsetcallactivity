"""SalesCollectionEntry model — sales and collection records per report."""
from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.report import DailyActivityReport

from sqlalchemy import Date, DateTime, ForeignKey, Integer, JSON, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base


class SalesCollectionEntry(Base):
    """
    Each row is one payment/collection/commitment record attached to a report.
    Multiple rows per category are allowed (e.g. multiple customers paying).

    Financial rule — NEVER combine:
      - actual_collection categories  (money physically received today)
      - commitment categories         (promises of future payment)
      These are tracked separately and must never be summed together.

    All amounts are stored as NUMERIC(15, 2) — BDT.
    No floating-point arithmetic is used for money.

    Stable category identifiers (display labels from AppSettings):
        total_sales
        new_sales
        new_sales_collection
        new_sales_commit_payment
        new_sales_commit_payment_2
        new_sales_commit_payment_3
        tb_collection
        total_token_to_booking_commit
        total_token_to_booking_commit_2
        total_token_to_booking_commit_3
        emi_collection
    """

    __tablename__ = "sales_collection_entries"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    report_id: Mapped[int] = mapped_column(
        ForeignKey("daily_activity_reports.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Stable machine identifier; human label comes from AppSettings
    category: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(String(300), nullable=True)

    # BDT amount — NUMERIC(15, 2) avoids floating-point errors
    amount: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False)

    # Payment sequence for commitment tracking (e.g. 1st, 2nd, 3rd payment)
    payment_sequence: Mapped[int | None] = mapped_column(nullable=True)

    customer_name: Mapped[str | None] = mapped_column(String(500), nullable=True)
    customer_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    payment_method: Mapped[str | None] = mapped_column(String(50), nullable=True)
    reference: Mapped[str | None] = mapped_column(String(200), nullable=True)

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Future commitment date & reschedule audit trail
    expected_payment_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    commitment_percentage: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reschedule_count: Mapped[int] = mapped_column(default=0, nullable=False)
    reschedule_history: Mapped[list[dict] | None] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # ── Relationship ──────────────────────────────────────────────────────────
    report: Mapped[DailyActivityReport] = relationship(
        "DailyActivityReport", back_populates="sales_collection_entries"
    )

    def __repr__(self) -> str:
        return (
            f"<SalesCollectionEntry id={self.id} "
            f"report_id={self.report_id} category={self.category!r} amount={self.amount}>"
        )
