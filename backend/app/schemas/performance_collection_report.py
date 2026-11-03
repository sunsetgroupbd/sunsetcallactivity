"""Schemas for Employee Performance & Collection Report."""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel, Field


class PerformanceIntervalSummary(BaseModel):
    """Cumulative progress summary up to a milestone day in the month (e.g. Till 5th, Till 10th)."""
    label: str  # "Till 5th", "Till 10th", "Till 15th", "Till 20th", "Till 25th", "Till 30th/31st"
    end_day: int
    new_sales: Decimal = Decimal("0")
    emi: Decimal = Decimal("0")
    total_collection: Decimal = Decimal("0")
    total_lead: int = 0
    fair_lead: int = 0
    fb_lead: int = 0
    hp: int = 0
    p: int = 0
    fup: int = 0
    outdoor_visits: int = 0
    indoor_cx: int = 0
    is_manual: bool = False
    admin_notes: Optional[str] = None


class EmployeeMonthlyPerformance(BaseModel):
    """Section 1: Employee Monthly Performance Report row with checkpoint milestones."""
    employee_id: int
    employee_name: str
    position: str
    month: str  # e.g. "November 2026" or "2026-11"
    
    # Financial Targets & Actuals
    target_sales: Decimal = Decimal("0")  # TG (Sales Target)
    target_collection: Decimal = Decimal("0")
    actual_new_sales: Decimal = Decimal("0")
    actual_emi: Decimal = Decimal("0")
    actual_tb: Decimal = Decimal("0")
    total_collection: Decimal = Decimal("0")
    
    # Lead Counts
    total_lead: int = 0
    fair_lead: int = 0
    fb_lead: int = 0
    hp: int = 0
    p: int = 0
    fup: int = 0
    
    # Predictions from Employee / Committed Pipeline
    prediction_sold_fair: Decimal = Decimal("0")
    prediction_sold_fb: Decimal = Decimal("0")
    prediction_sold_other: Decimal = Decimal("0")
    prediction_hold: Decimal = Decimal("0")
    prediction_cancel: Decimal = Decimal("0")
    
    # Milestones (Till 5th, 10th, 15th, 20th, 25th, 30th/31st)
    intervals: List[PerformanceIntervalSummary] = Field(default_factory=list)


class CustomerCollectionItem(BaseModel):
    """Section 2: Customer-wise Collection Report row."""
    id: int
    customer_name: str
    customer_phone: Optional[str] = None
    paid_amount: Decimal = Decimal("0")
    unpaid_amount: Decimal = Decimal("0")
    collection_date: Optional[date] = None
    
    # IN/OUT Plan & Dates
    in_out_plan: str = "Office / Call"  # "Indoor CX", "Outdoor Visit", "Office / Call"
    date_1: Optional[date] = None  # Contact / Initial Meeting Date
    date_2: Optional[date] = None  # Follow-up Date
    
    # Amounts by Category
    new_sales_amount: Decimal = Decimal("0")
    tb_amount: Decimal = Decimal("0")
    emi_amount: Decimal = Decimal("0")
    
    next_collection_date: Optional[date] = None  # Future promised payment date
    lead_status: str = "P"  # HP, P, FUB, NI, CX, Sold, etc.
    total_collection: Decimal = Decimal("0")
    remarks: Optional[str] = None
    
    employee_id: int
    employee_name: str


class PerformanceCollectionSummaryTotals(BaseModel):
    total_target: Decimal = Decimal("0")
    total_new_sales: Decimal = Decimal("0")
    total_emi: Decimal = Decimal("0")
    total_tb: Decimal = Decimal("0")
    total_collection: Decimal = Decimal("0")
    total_paid: Decimal = Decimal("0")
    total_unpaid: Decimal = Decimal("0")
    total_leads: int = 0
    total_fair_leads: int = 0
    total_fb_leads: int = 0
    total_hp: int = 0
    total_p: int = 0
    total_fup: int = 0


class PerformanceCollectionReportResponse(BaseModel):
    month: str
    date_from: date
    date_to: date
    monthly_performances: List[EmployeeMonthlyPerformance] = Field(default_factory=list)
    customer_collections: List[CustomerCollectionItem] = Field(default_factory=list)
    summary: PerformanceCollectionSummaryTotals
    company_intervals: List[PerformanceIntervalSummary] = Field(default_factory=list)


class MilestoneCheckpointItem(BaseModel):
    checkpoint_day: int
    label: str
    new_sales: Decimal = Decimal("0")
    emi: Decimal = Decimal("0")
    total_collection: Decimal = Decimal("0")
    total_lead: int = 0
    fair_lead: int = 0
    fb_lead: int = 0
    hp: int = 0
    p: int = 0
    fup: int = 0
    outdoor_visits: int = 0
    indoor_cx: int = 0
    admin_notes: Optional[str] = None


class MilestoneCheckpointsBulkSaveRequest(BaseModel):
    month: str  # "YYYY-MM"
    employee_id: Optional[int] = None  # None for Company-Wide, integer for Employee
    checkpoints: List[MilestoneCheckpointItem]


class MilestoneCheckpointRead(MilestoneCheckpointItem):
    id: int
    month: str
    employee_id: Optional[int] = None
    is_manual: bool = True
    updated_by_id: Optional[int] = None

