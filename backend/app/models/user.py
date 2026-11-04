"""User model — authentication, roles, and identity."""
from __future__ import annotations

import enum
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from app.models.report import DailyActivityReport
    from app.models.targets import DailyTargets
    from app.models.team import Team

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    SUB_ADMIN = "sub_admin"
    TL = "tl"
    CO = "co"
    EMPLOYEE = "employee"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True, nullable=False)
    phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    username: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    designation: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(200), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="userrole"), default=UserRole.EMPLOYEE, nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Dynamic Team and Manager Hierarchy
    team_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("teams.id", ondelete="SET NULL"), nullable=True, index=True
    )
    reporting_manager_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    client_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    client_share_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

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
    team: Mapped[Optional[Team]] = relationship(
        "Team",
        back_populates="members",
        foreign_keys=[team_id],
        lazy="selectin",
    )
    reporting_manager: Mapped[Optional[User]] = relationship(
        "User",
        remote_side="User.id",
        foreign_keys=[reporting_manager_id],
        lazy="selectin",
    )
    subordinates: Mapped[list[User]] = relationship(
        "User",
        back_populates="reporting_manager",
        foreign_keys=[reporting_manager_id],
        lazy="select",
    )

    reports: Mapped[list[DailyActivityReport]] = relationship(
        "DailyActivityReport",
        back_populates="employee",
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="select",
    )
    targets: Mapped[list[DailyTargets]] = relationship(
        "DailyTargets",
        back_populates="employee",
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="select",
    )

    @property
    def team_name(self) -> Optional[str]:
        return self.team.name if self.team else None

    @property
    def reporting_manager_name(self) -> Optional[str]:
        return self.reporting_manager.full_name if self.reporting_manager else None

    def __repr__(self) -> str:
        return f"<User id={self.id} username={self.username!r} role={self.role}>"
