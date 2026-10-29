"""Notice board model — corporate announcements, circulars, and PDF notices."""
from __future__ import annotations

import enum
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base


class NoticeType(str, enum.Enum):
    TEXT = "text"
    PDF = "pdf"


class NoticeStatus(str, enum.Enum):
    PUBLISHED = "published"
    PENDING_APPROVAL = "pending_approval"
    REJECTED = "rejected"


class NoticePriority(str, enum.Enum):
    NORMAL = "normal"
    IMPORTANT = "important"
    URGENT = "urgent"


class Notice(Base):
    __tablename__ = "notices"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    notice_type: Mapped[NoticeType] = mapped_column(
        Enum(NoticeType, name="noticetype"), default=NoticeType.TEXT, nullable=False
    )
    content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    file_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    file_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    status: Mapped[NoticeStatus] = mapped_column(
        Enum(NoticeStatus, name="noticestatus"), default=NoticeStatus.PUBLISHED, nullable=False, index=True
    )
    priority: Mapped[NoticePriority] = mapped_column(
        Enum(NoticePriority, name="noticepriority"), default=NoticePriority.NORMAL, nullable=False
    )

    created_by_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL", onupdate="CASCADE"), nullable=True
    )
    approved_by_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL", onupdate="CASCADE"), nullable=True
    )
    approval_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # ── Relationships ─────────────────────────────────────────────────────────
    created_by: Mapped[Optional["User"]] = relationship(  # noqa: F821
        "User", foreign_keys=[created_by_id], lazy="joined"
    )
    approved_by: Mapped[Optional["User"]] = relationship(  # noqa: F821
        "User", foreign_keys=[approved_by_id], lazy="joined"
    )

    def __repr__(self) -> str:
        return f"<Notice id={self.id} title={self.title!r} type={self.notice_type} status={self.status}>"
