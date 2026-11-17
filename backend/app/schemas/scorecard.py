"""Pydantic schemas for Monthly Executive Scorecard."""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, List, Optional
from pydantic import BaseModel, Field, field_validator


# ─── Table 1: Performance By Period (Row Schema) ──────────────────────────────
class ScorecardPeriodRow(BaseModel):
    """
    Performance metrics row for Table 1:
    Either a previous month (e.g. Sep-26, Oct-26) or a cumulative checkpoint (Till 5th, 10th...).
    """
    row_type: str  # "previous_month" | "checkpoint"
    label: str  # "Sep-26", "Oct-26", "Till 5th", "Till 10th", ..., "Till 30th/31st"
    end_day: Optional[int] = None

    # Target
    tg_sales: Decimal = Decimal("0.00")

    # Actual Collections (Cash received physically)
    new_sales: Decimal = Decimal("0.00")
    tb: Decimal = Decimal("0.00")
    emi: Decimal = Decimal("0.00")
    total_collection: Decimal = Decimal("0.00")

    # Lead Inventory
    total_lead: int = 0
    current_fair_lead: int = 0
    current_fb_lead: int = 0
    hp: int = 0
    p: int = 0
    fup: int = 0

    # Total Fair / Total FB / Total Dialed
    total_fair_lead: int = 0
    total_fb_lead: int = 0
    total_calls_dialed: int = 0

    # Hold / Cancel (from sales commitments/descriptions)
    hold_amount: Decimal = Decimal("0.00")
    cancel_amount: Decimal = Decimal("0.00")

    # Meetings Done
    in_done: int = 0  # Indoor CX count
    out_done: int = 0  # Outdoor Visit count

    # Sold Breakdown by Source
    sold_fair: Decimal = Decimal("0.00")
    sold_fb: Decimal = Decimal("0.00")
    sold_other: Decimal = Decimal("0.00")

    # Evaluation Scores
    sheet_score: Optional[Decimal] = None
    call_score: Optional[Decimal] = None
    marking: Optional[int] = None

    # Attendance & Forecast
    planned_leave: int = 0
    unauthorized_leave: int = 0
    prediction_amount: Decimal = Decimal("0.00")


# ─── Table 2: Customer Collection Plan ────────────────────────────────────────
class ScorecardCustomerBase(BaseModel):
    customer_name: str
    paid_amount: Decimal = Decimal("0.00")
    unpaid_amount: Decimal = Decimal("0.00")
    collection_date: Optional[date] = None
    next_collection_date: Optional[date] = None
    next_collection_date_2: Optional[date] = None
    in_out_plan: str = "Office / Call"
    date_1: Optional[date] = None
    date_2: Optional[date] = None
    new_sales_amount: Decimal = Decimal("0.00")
    tb_amount: Decimal = Decimal("0.00")
    emi_amount: Decimal = Decimal("0.00")
    new_lead_status: str = "P"
    collection_probability: int = Field(default=50, ge=10, le=100)
    remarks: Optional[str] = None
    commitment_entry_id: Optional[int] = None

    @field_validator(
        "collection_date",
        "next_collection_date",
        "next_collection_date_2",
        "date_1",
        "date_2",
        mode="before",
    )
    @classmethod
    def empty_str_to_none_date(cls, v: Any) -> Any:
        if v == "" or v is None:
            return None
        return v

    @field_validator("collection_probability")
    @classmethod
    def validate_probability_step(cls, v: int) -> int:
        if v % 10 != 0:
            raise ValueError("Probability must be a multiple of 10 between 10 and 100")
        return v


class ScorecardCustomerCreate(ScorecardCustomerBase):
    pass


class ScorecardCustomerUpdate(BaseModel):
    customer_name: Optional[str] = None
    paid_amount: Optional[Decimal] = None
    unpaid_amount: Optional[Decimal] = None
    collection_date: Optional[date] = None
    next_collection_date: Optional[date] = None
    next_collection_date_2: Optional[date] = None
    in_out_plan: Optional[str] = None
    date_1: Optional[date] = None
    date_2: Optional[date] = None
    new_sales_amount: Optional[Decimal] = None
    tb_amount: Optional[Decimal] = None
    emi_amount: Optional[Decimal] = None
    new_lead_status: Optional[str] = None
    collection_probability: Optional[int] = Field(None, ge=10, le=100)
    remarks: Optional[str] = None
    commitment_entry_id: Optional[int] = None

    @field_validator(
        "collection_date",
        "next_collection_date",
        "next_collection_date_2",
        "date_1",
        "date_2",
        mode="before",
    )
    @classmethod
    def empty_str_to_none_date(cls, v: Any) -> Any:
        if v == "" or v is None:
            return None
        return v

    @field_validator("collection_probability")
    @classmethod
    def validate_probability_step(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and v % 10 != 0:
            raise ValueError("Probability must be a multiple of 10 between 10 and 100")
        return v


class ScorecardCustomerRead(ScorecardCustomerBase):
    id: int
    scorecard_id: int
    total_collection: Decimal
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ─── Scorecard Header & Portfolio ─────────────────────────────────────────────
class ScorecardHeader(BaseModel):
    employee_id: int
    employee_formatted_id: str
    employee_name: str
    position: Optional[str] = None
    tl_name: Optional[str] = None
    co_name: Optional[str] = None
    team_name: Optional[str] = None
    month: str  # "YYYY-MM"


class PortfolioSnapshot(BaseModel):
    emi_due_monthly: Decimal = Decimal("0.00")
    emi_client_count: int = 0
    emi_hold_count: int = 0
    emi_cancel_count: int = 0
    tb_due_amount: Decimal = Decimal("0.00")
    tb_client_count: int = 0
    tb_share_count: int = 0
    tb_hold_count: int = 0
    tb_cancel_count: int = 0


# ─── Full Scorecard Response ──────────────────────────────────────────────────
class MonthlyScorecardResponse(BaseModel):
    id: int
    header: ScorecardHeader
    status: str  # "draft" | "closed"
    closed_at: Optional[datetime] = None
    closed_by_name: Optional[str] = None

    # Attendance & Forecast
    prediction_amount: Decimal = Decimal("0.00")
    planned_leave: int = 0
    unauthorized_leave: int = 0

    # Supervisor evaluation
    sheet_score: Optional[Decimal] = None
    call_score: Optional[Decimal] = None
    marking: Optional[int] = None
    supervisor_notes: Optional[str] = None

    # Portfolio
    portfolio: PortfolioSnapshot

    # Table 1: Performance by period
    periods: List[ScorecardPeriodRow]

    # Table 2: Customer collection plan
    customers: List[ScorecardCustomerRead]

    # Can current user edit supervisor fields?
    can_edit_marking: bool = False
    can_close: bool = False


# ─── Update Request ───────────────────────────────────────────────────────────
class MonthlyScorecardUpdateRequest(BaseModel):
    # Executive / Editable fields
    prediction_amount: Optional[Decimal] = None
    planned_leave: Optional[int] = None
    unauthorized_leave: Optional[int] = None

    # Portfolio snapshot updates
    emi_due_monthly: Optional[Decimal] = None
    emi_client_count: Optional[int] = None
    emi_hold_count: Optional[int] = None
    emi_cancel_count: Optional[int] = None
    tb_due_amount: Optional[Decimal] = None
    tb_client_count: Optional[int] = None
    tb_share_count: Optional[int] = None
    tb_hold_count: Optional[int] = None
    tb_cancel_count: Optional[int] = None

    # Supervisor / Restricted fields
    sheet_score: Optional[Decimal] = None
    call_score: Optional[Decimal] = None
    marking: Optional[int] = Field(None, ge=0, le=100)
    supervisor_notes: Optional[str] = None


# ─── Team Rollup Item ─────────────────────────────────────────────────────────
class ScorecardTeamItem(BaseModel):
    employee_id: int
    employee_formatted_id: str
    employee_name: str
    position: Optional[str] = None
    team_name: Optional[str] = None
    tl_name: Optional[str] = None
    co_name: Optional[str] = None
    status: str
    target_sales: Decimal
    actual_new_sales: Decimal
    actual_tb: Decimal
    actual_emi: Decimal
    total_collection: Decimal
    total_calls: int
    marking: Optional[int] = None
    prediction_amount: Decimal = Decimal("0.00")
    customer_plan_count: int = 0
    customer_plan_expected_total: Decimal = Decimal("0.00")


class ScorecardTeamRollupResponse(BaseModel):
    month: str
    total_executives: int
    total_target: Decimal
    total_new_sales: Decimal
    total_tb: Decimal
    total_emi: Decimal
    total_collection: Decimal
    items: List[ScorecardTeamItem]
