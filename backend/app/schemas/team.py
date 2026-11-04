"""Pydantic schemas for Team endpoints."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


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

