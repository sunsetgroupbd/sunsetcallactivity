"""Pydantic schemas for SalesCollectionEntry and Commitment Pipeline."""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator


class SalesCollectionEntryBase(BaseModel):
    category: str = Field(..., max_length=100)
    description: Optional[str] = Field(None, max_length=300)
    amount: Decimal = Field(..., decimal_places=2, ge=Decimal("0"))
    payment_sequence: Optional[int] = Field(None, ge=1)
    customer_name: Optional[str] = Field(None, max_length=500)
    customer_phone: Optional[str] = Field(None, max_length=50)
    payment_method: Optional[str] = Field(None, max_length=50)
    reference: Optional[str] = Field(None, max_length=200)
    notes: Optional[str] = None
    expected_payment_date: Optional[date] = None
    commitment_percentage: Optional[int] = Field(None, ge=1, le=100)
    reschedule_count: int = 0
    reschedule_history: Optional[List[Dict[str, Any]]] = None

    @field_validator("amount", mode="before")
    @classmethod
    def parse_amount(cls, v):
        return Decimal(str(v))


class SalesCollectionEntryCreate(SalesCollectionEntryBase):
    pass


class SalesCollectionEntryUpdate(BaseModel):
    category: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = Field(None, max_length=300)
    amount: Optional[Decimal] = Field(None, decimal_places=2, ge=Decimal("0"))
    payment_sequence: Optional[int] = Field(None, ge=1)
    customer_name: Optional[str] = Field(None, max_length=500)
    customer_phone: Optional[str] = Field(None, max_length=50)
    payment_method: Optional[str] = Field(None, max_length=50)
    reference: Optional[str] = Field(None, max_length=200)
    notes: Optional[str] = None
    expected_payment_date: Optional[date] = None
    commitment_percentage: Optional[int] = Field(None, ge=1, le=100)
    reschedule_reason: Optional[str] = None

    @field_validator("amount", mode="before")
    @classmethod
    def parse_amount(cls, v):
        if v is None:
            return v
        return Decimal(str(v))


class SalesCollectionEntryRead(SalesCollectionEntryBase):
    id: int
    report_id: int
    created_at: datetime

    model_config = {"from_attributes": True}


class SalesCollectionListRead(BaseModel):
    report_id: int
    entries: List[SalesCollectionEntryRead]


class CommitmentItemRead(BaseModel):
    id: int
    report_id: int
    report_date: date
    employee_id: int
    employee_name: Optional[str] = None
    category: str
    amount: Decimal
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    expected_payment_date: Optional[date] = None
    commitment_percentage: Optional[int] = None
    reschedule_count: int = 0
    reschedule_history: Optional[List[Dict[str, Any]]] = None
    payment_method: Optional[str] = None
    reference: Optional[str] = None
    notes: Optional[str] = None
    status: str = "upcoming"  # "due_today" | "overdue" | "upcoming" | "no_date"

    model_config = {"from_attributes": True}


class CommitmentPipelineResponse(BaseModel):
    total_promised_amount: Decimal
    total_commitments: int
    rescheduled_count: int
    items: List[CommitmentItemRead]
