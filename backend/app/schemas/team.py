"""Pydantic schemas for Team endpoints."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from app.models.user import UserRole


def _parse_role(v: object) -> object:
    if isinstance(v, str):
        clean = v.strip().lower()
        if clean in ("tl", "team_leader", "team leader", "lead", "team lead"):
            return UserRole.TL
        if clean in ("co", "coordinator", "coord"):
            return UserRole.CO
        if clean in ("admin", "administrator"):
            return UserRole.ADMIN
        if clean in ("sub_admin", "subadmin", "sub admin"):
            return UserRole.SUB_ADMIN
        return UserRole.EMPLOYEE
    return v


class TeamBase(BaseModel):
    name: str = Field(..., max_length=100)
    director_name: Optional[str] = Field(None, max_length=150)
    display_order: int = Field(0, description="Sorting sequence for display")
    is_active: bool = True


class TeamCreate(TeamBase):
    pass


class TeamUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    director_name: Optional[str] = Field(None, max_length=150)
    display_order: Optional[int] = None
    is_active: Optional[bool] = None


class TeamRead(TeamBase):
    id: int
    member_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TeamBulkAssign(BaseModel):
    team_id: int
    employee_ids: list[int]
    role: Optional[UserRole] = None
    reporting_manager_id: Optional[int] = None

    @field_validator("role", mode="before")
    @classmethod
    def normalize_role(cls, v: object) -> object:
        if v is None:
            return None
        return _parse_role(v)

