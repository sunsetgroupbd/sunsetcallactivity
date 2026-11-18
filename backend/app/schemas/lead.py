"""Pydantic schemas for the Lead-wise Calling Workflow."""
from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional
from pydantic import BaseModel, Field


class LeadCallOutcome(BaseModel):
    new_status: str = Field(..., description="Target status: hp, p, fup, ni, nr")
    call_duration_seconds: Optional[int] = Field(None, ge=0)
    notes: Optional[str] = None


class LeadCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    phone: str = Field(..., min_length=3, max_length=50)
    source: str = Field("cold_lead", description="fb_lead, fair_lead, cold_lead, reference")
    status: str = Field("fup", description="hp, p, fup, ni, nr")
    assigned_to_id: Optional[int] = Field(None, description="Executive ID. Required for admin, optional for executive")
    notes: Optional[str] = None


class LeadUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    phone: Optional[str] = Field(None, min_length=3, max_length=50)
    source: Optional[str] = None
    status: Optional[str] = None
    assigned_to_id: Optional[int] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class LeadCallLogRead(BaseModel):
    id: int
    lead_id: int
    caller_id: int
    caller_name: Optional[str] = None
    from_status: Optional[str] = None
    to_status: str
    called_at: datetime
    call_duration_seconds: Optional[int] = None
    notes: Optional[str] = None

    class Config:
        from_attributes = True


class LeadRead(BaseModel):
    id: int
    name: str
    phone: str
    source: str
    status: str
    assigned_to_id: int
    assigned_to_name: Optional[str] = None
    created_by_id: Optional[int] = None
    lead_date: date
    last_called_at: Optional[datetime] = None
    total_calls_count: int = 0
    notes: Optional[str] = None
    is_active: bool = True
    created_at: datetime
    updated_at: datetime
    latest_call: Optional[LeadCallLogRead] = None
    call_logs: List[LeadCallLogRead] = Field(default_factory=list)
    delegated_to_id: Optional[int] = None
    delegated_to_name: Optional[str] = None
    delegated_at: Optional[datetime] = None
    delegation_notes: Optional[str] = None
    is_delegated_to_me: Optional[bool] = None
    is_delegated_by_me: Optional[bool] = None

    class Config:
        from_attributes = True


class LeadDelegatePayload(BaseModel):
    delegated_to_id: int
    notes: Optional[str] = None


class BulkLeadDelegatePayload(BaseModel):
    lead_ids: Optional[List[int]] = None
    delegated_to_id: int
    notes: Optional[str] = None


class BulkRevokeDelegatePayload(BaseModel):
    lead_ids: Optional[List[int]] = None


class LeadStatusCounts(BaseModel):
    hp: int = 0
    p: int = 0
    fup: int = 0
    ni: int = 0
    nr: int = 0
    total: int = 0


class LeadSummaryResponse(BaseModel):
    fb_lead: LeadStatusCounts
    fair_lead: LeadStatusCounts
    cold_lead: LeadStatusCounts
    reference: LeadStatusCounts
    total_active_leads: int = 0
    today_calls_made: int = 0
