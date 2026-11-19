"""Lead and LeadCallLog models — lead-wise calling workflow."""
from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING, List, Optional

if TYPE_CHECKING:
    from app.models.user import User

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base


class Lead(Base):
    """
    Individual lead tracked per executive.
    Sources:
        - fb_lead (FB Lead)
        - fair_lead (Fair Lead)
        - cold_lead (Cold Lead)
        - reference (Reference)
    Statuses:
        - hp (High Potential)
        - p (Potential)
        - fup (Follow Up)
        - ni (Not Interested)
        - nr (Not Reached)
    """

    __tablename__ = "leads"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    phone: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    source: Mapped[str] = mapped_column(String(50), nullable=False, default="cold_lead", index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="fup", index=True)

    # Ownership
    assigned_to_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_by_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )

    # Temporary Absence Coverage / Delegation
    delegated_to_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    delegated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    delegation_notes: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Automatically recorded lead creation date (Dhaka timezone)
    lead_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    last_called_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    total_calls_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    assigned_to: Mapped[User] = relationship(
        "User", foreign_keys=[assigned_to_id], lazy="selectin"
    )
    created_by: Mapped[Optional[User]] = relationship(
        "User", foreign_keys=[created_by_id], lazy="selectin"
    )
    delegated_to: Mapped[Optional[User]] = relationship(
        "User", foreign_keys=[delegated_to_id], lazy="selectin"
    )
    call_logs: Mapped[List[LeadCallLog]] = relationship(
        "LeadCallLog",
        back_populates="lead",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="desc(LeadCallLog.called_at)",
    )

    def __repr__(self) -> str:
        return f"<Lead id={self.id} name={self.name!r} source={self.source} status={self.status}>"


class LeadCallLog(Base):
    """
    Audit log of every call made to a lead, tracking status transitions and notes.
    """

    __tablename__ = "lead_call_logs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    lead_id: Mapped[int] = mapped_column(
        ForeignKey("leads.id", ondelete="CASCADE"), nullable=False, index=True
    )
    caller_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    from_status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    to_status: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    called_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    call_duration_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    lead: Mapped[Lead] = relationship("Lead", back_populates="call_logs")
    caller: Mapped[User] = relationship("User", foreign_keys=[caller_id], lazy="selectin")

    def __repr__(self) -> str:
        return f"<LeadCallLog id={self.id} lead_id={self.lead_id} to_status={self.to_status}>"


class LeadTransferLog(Base):
    """
    Audit log of permanent lead ownership transfers (e.g. employee job switch, resignation, or reallocation).
    Restricted to Administrators and Sub-Administrators only.
    """

    __tablename__ = "lead_transfer_logs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    lead_id: Mapped[int] = mapped_column(
        ForeignKey("leads.id", ondelete="CASCADE"), nullable=False, index=True
    )
    from_employee_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    to_employee_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    transferred_by_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    lead_status_at_transfer: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    reason: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    transferred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    # Relationships
    lead: Mapped[Lead] = relationship("Lead", backref="transfer_logs", lazy="selectin")
    from_employee: Mapped[User] = relationship("User", foreign_keys=[from_employee_id], lazy="selectin")
    to_employee: Mapped[User] = relationship("User", foreign_keys=[to_employee_id], lazy="selectin")
    transferred_by: Mapped[User] = relationship("User", foreign_keys=[transferred_by_id], lazy="selectin")

    def __repr__(self) -> str:
        return (
            f"<LeadTransferLog id={self.id} lead_id={self.lead_id} "
            f"from={self.from_employee_id} to={self.to_employee_id} by={self.transferred_by_id}>"
        )
