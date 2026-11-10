"""User model — authentication, roles, and identity."""
from __future__ import annotations

import enum
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any, Optional, Union

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

    @classmethod
    def _missing_(cls, value: object):
        if isinstance(value, str):
            clean = value.strip().lower()
            for member in cls:
                if member.value == clean or member.name.lower() == clean:
                    return member
        return None


class RobustUserRoleEnum(Enum):
    """
    Custom SQLAlchemy Enum that seamlessly handles ANY case variation
    ('ADMIN', 'admin', 'EMPLOYEE', 'employee', 'CO', 'co', 'TL', 'tl', 'SUB_ADMIN', 'sub_admin')
    from the database without throwing LookupError.
    """
    def __init__(self, *enums, **kw):
        super().__init__(*enums, **kw)

    def _setup_for_values(self, values, objects, kw):
        super()._setup_for_values(values, objects, kw)
        # Populate both uppercase names and lowercase values in lookup dictionaries
        for obj in objects:
            if hasattr(obj, "name"):
                self._object_lookup[obj.name] = obj
                self._valid_lookup[obj.name] = self._valid_lookup.get(obj, obj.name)
            if hasattr(obj, "value"):
                self._object_lookup[obj.value] = obj
                self._valid_lookup[obj.value] = self._valid_lookup.get(obj, obj.value)
        # Ensure enums list contains both uppercase and lowercase for dialect reflection
        seen = set(self.enums)
        for obj in objects:
            if hasattr(obj, "name") and obj.name not in seen:
                self.enums.append(obj.name)
                seen.add(obj.name)
            if hasattr(obj, "value") and obj.value not in seen:
                self.enums.append(obj.value)
                seen.add(obj.value)

    def _object_value_for_elem(self, elem: Any) -> Any:
        if elem is None:
            return None
        # 1. Exact match in _object_lookup
        if elem in self._object_lookup:
            return self._object_lookup[elem]

        # 2. Case-insensitive lookup against _object_lookup
        if isinstance(elem, str):
            clean = elem.strip().lower()
            for k, v in self._object_lookup.items():
                if str(k).lower() == clean:
                    return v

            # 3. Match against UserRole enum members
            for member in UserRole:
                if member.value == clean or member.name.lower() == clean:
                    return member

        # 4. Fallback through UserRole constructor (supported by _missing_)
        try:
            return UserRole(elem)
        except Exception:
            return UserRole.EMPLOYEE

    def _db_value_for_elem(self, elem: Any) -> Any:
        if elem is None:
            return None
        if elem in self._valid_lookup:
            return self._valid_lookup[elem]
        if isinstance(elem, str):
            clean = elem.strip().lower()
            for k, v in self._valid_lookup.items():
                if str(k).lower() == clean:
                    return v
            for member in UserRole:
                if member.value == clean or member.name.lower() == clean:
                    if member in self._valid_lookup:
                        return self._valid_lookup[member]
        return elem


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
        RobustUserRoleEnum(UserRole, name="userrole"),
        default=UserRole.EMPLOYEE,
        nullable=False,
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
        try:
            return self.team.name if self.team else None
        except Exception:
            return None

    @property
    def reporting_manager_name(self) -> Optional[str]:
        try:
            return self.reporting_manager.full_name if self.reporting_manager else None
        except Exception:
            return None

    def __repr__(self) -> str:
        return f"<User id={self.id} username={self.username!r} role={self.role}>"
