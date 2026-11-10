"""Pydantic schemas for User endpoints."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

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


class UserBase(BaseModel):
    full_name: str = Field(..., max_length=200)
    email: str = Field(..., max_length=255)
    phone: Optional[str] = Field(None, max_length=50)
    designation: Optional[str] = Field(None, max_length=150)
    username: str = Field(..., min_length=3, max_length=100, pattern=r"^[\w.-]+$")
    role: UserRole = UserRole.EMPLOYEE
    is_active: bool = True
    team_id: Optional[int] = None
    reporting_manager_id: Optional[int] = None
    client_count: int = 0
    client_share_count: int = 0

    @field_validator("role", mode="before")
    @classmethod
    def normalize_role(cls, v: object) -> object:
        return _parse_role(v)


class UserCreate(UserBase):
    password: str = Field(..., min_length=8, max_length=128)
    id: Optional[int] = Field(None, description="Optional custom numeric Employee ID")


class UserUpdate(BaseModel):
    id: Optional[int] = Field(None, description="Optional updated numeric Employee ID")
    full_name: Optional[str] = Field(None, max_length=200)
    email: Optional[str] = Field(None, max_length=255)
    phone: Optional[str] = Field(None, max_length=50)
    designation: Optional[str] = Field(None, max_length=150)
    username: Optional[str] = Field(None, min_length=3, max_length=100)
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    password: Optional[str] = Field(None, min_length=8, max_length=128)
    team_id: Optional[int] = None
    reporting_manager_id: Optional[int] = None
    client_count: Optional[int] = None
    client_share_count: Optional[int] = None

    @field_validator("role", mode="before")
    @classmethod
    def normalize_role(cls, v: object) -> object:
        if v is None:
            return None
        return _parse_role(v)


class UserRead(UserBase):
    id: int
    team_name: Optional[str] = None
    reporting_manager_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class UserReadPublic(BaseModel):
    """Minimal public user representation — safe to embed in other responses."""
    id: int
    full_name: str
    username: str

    model_config = {"from_attributes": True}
