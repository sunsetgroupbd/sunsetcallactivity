"""CrmPhoneIndex model for high-performance CRM phone number deduplication."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base_class import Base


class CrmPhoneIndex(Base):
    __tablename__ = "crm_phone_index"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    phone_normalized: Mapped[str] = mapped_column(String(20), unique=True, index=True, nullable=False)
    phone_raw: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    lead_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    lead_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    assigned_to: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    status: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    project: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    source: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    created_at_crm: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    synced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
