"""Pydantic schemas for outdoor and fair visits."""
from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


class OutdoorVisitCreate(BaseModel):
    visit_date: Optional[date] = None
    visit_type: str = Field("client_site", description="'client_site' or 'fair'")
    title: Optional[str] = None
    departure_time: Optional[str] = None
    return_time: Optional[str] = None
    duration_minutes: Optional[int] = 0
    status: Optional[str] = "completed"
    is_present: Optional[bool] = True
    notes: Optional[str] = None
    employee_id: Optional[int] = None


class FairStartPayload(BaseModel):
    visit_date: Optional[date] = None
    title: Optional[str] = "Fair Duty"
    departure_time: Optional[str] = None
    notes: Optional[str] = None
    employee_id: Optional[int] = None


class FairReturnPayload(BaseModel):
    log_id: Optional[int] = None
    return_time: Optional[str] = None
    notes: Optional[str] = None


class OutdoorVisitRead(BaseModel):
    id: int
    report_id: Optional[int] = None
    employee_id: int
    employee_name: Optional[str] = None
    visit_date: date
    visit_type: str
    title: Optional[str] = None
    departure_time: Optional[str] = None
    return_time: Optional[str] = None
    duration_minutes: int = 0
    status: str = "completed"
    is_present: bool = True
    notes: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
