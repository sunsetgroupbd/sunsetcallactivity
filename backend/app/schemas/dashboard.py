"""Pydantic schemas for DailyTargets and dashboard summaries."""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field, field_validator, model_validator


class TargetsBase(BaseModel):
    effective_from: date
    sales_target: Optional[Decimal] = Field(None, decimal_places=2, ge=Decimal("0"))
    tb_target: Optional[Decimal] = Field(None, decimal_places=2, ge=Decimal("0"))
    emi_target: Optional[Decimal] = Field(None, decimal_places=2, ge=Decimal("0"))
    outdoor_visit_target: Optional[int] = Field(None, ge=0)
    dialed_calls_target: Optional[int] = Field(None, ge=0)
    connected_calls_target: Optional[int] = Field(None, ge=0)
    meeting_hours_target: Optional[Decimal] = Field(None, decimal_places=2, ge=Decimal("0"))
    employee_id: Optional[int] = None  # None = global default


class TargetsCreate(TargetsBase):
    pass


class TargetsUpdate(BaseModel):
    effective_from: Optional[date] = None
    sales_target: Optional[Decimal] = None
    tb_target: Optional[Decimal] = None
    emi_target: Optional[Decimal] = None
    outdoor_visit_target: Optional[int] = None
    dialed_calls_target: Optional[int] = None
    connected_calls_target: Optional[int] = None
    meeting_hours_target: Optional[Decimal] = None


class TargetsRead(TargetsBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ─── Dashboard / Summary Schemas ──────────────────────────────────────────────

class SlotBreakdown(BaseModel):
    slot_10am_1pm: Optional[int] = None
    slot_2pm_5pm: Optional[int] = None
    slot_5pm_6pm: Optional[int] = None


class LeadCategoryBreakdown(BaseModel):
    lead_category: str
    total_dialed: Optional[int] = None
    total_connected: Optional[int] = None
    total_duration_minutes: Optional[int] = None
    lead_status_hp: Optional[int] = None
    lead_status_p: Optional[int] = None
    lead_status_fub: Optional[int] = None
    lead_status_ni: Optional[int] = None


class TargetAchievement(BaseModel):
    """Pairs an actual value with its target. achievement_pct is None if no target."""
    actual: Optional[Decimal] = None
    target: Optional[Decimal] = None
    achievement_pct: Optional[Decimal] = None
    base_target: Optional[Decimal] = None
    carry_forward: Optional[Decimal] = None
    monthly_target: Optional[Decimal] = None
    call_reduction: Optional[int] = None


class ReportSummary(BaseModel):
    """Calculated summary for a single daily report."""
    report_id: int
    report_date: date
    employee_id: int
    employee_name: Optional[str] = None

    # Call totals
    total_dialed: int = 0
    total_connected: int = 0
    connection_rate_pct: Optional[Decimal] = None
    total_call_duration_minutes: int = 0

    # Slot totals (across all categories)
    call_slots: SlotBreakdown = SlotBreakdown()

    # Meeting
    total_outdoor_visits: int = 0
    total_meeting_duration_minutes: int = 0

    # Financial (BDT) — actual vs commitments are SEPARATE
    total_new_sales: Decimal = Decimal("0")
    total_actual_collection: Decimal = Decimal("0")
    total_sales_commitments: Decimal = Decimal("0")
    total_tb_collection: Decimal = Decimal("0")
    total_tb_commitments: Decimal = Decimal("0")
    total_emi_collection: Decimal = Decimal("0")
    total_emi_commitments: Decimal = Decimal("0")

    # Target achievement
    dialed_calls: TargetAchievement = TargetAchievement()
    connected_calls: TargetAchievement = TargetAchievement()
    outdoor_visits: TargetAchievement = TargetAchievement()
    sales: TargetAchievement = TargetAchievement()
    tb: TargetAchievement = TargetAchievement()
    emi: TargetAchievement = TargetAchievement()
    meeting_hours: TargetAchievement = TargetAchievement()

    # Breakdowns
    lead_category_breakdown: list[LeadCategoryBreakdown] = []

    # Frontend aliases for seamless compatibility across report logs & analytics
    total_calls_dialed: Optional[int] = None
    total_calls_connected: Optional[int] = None
    total_meeting_time_minutes: Optional[int] = None
    actual_collection_bdt: Optional[Decimal] = None
    commitments_bdt: Optional[Decimal] = None

    @model_validator(mode="after")
    def populate_aliases(self) -> "ReportSummary":
        self.total_calls_dialed = self.total_dialed
        self.total_calls_connected = self.total_connected
        self.total_meeting_time_minutes = self.total_meeting_duration_minutes
        self.actual_collection_bdt = self.total_actual_collection
        self.commitments_bdt = (
            self.total_sales_commitments
            + self.total_tb_commitments
            + self.total_emi_commitments
        )
        return self


class DashboardSummary(BaseModel):
    """Aggregated summary across a date range / employee filter."""
    date_from: date
    date_to: date
    employee_id: Optional[int] = None
    report_count: int = 0
    submitted_reports: int = 0

    # Aliases for frontend compatibility
    period_start: Optional[date] = None
    period_end: Optional[date] = None
    total_reports: int = 0
    total_calls_dialed: int = 0
    total_calls_connected: int = 0
    total_meeting_time_minutes: int = 0
    total_indoor_cx: int = 0
    actual_collection_bdt: Decimal = Decimal("0")
    commitments_bdt: Decimal = Decimal("0")
    tb_collection_bdt: Decimal = Decimal("0")
    tb_commitments_bdt: Decimal = Decimal("0")
    emi_collection_bdt: Decimal = Decimal("0")
    new_sales_collection_bdt: Decimal = Decimal("0")
    sales_commitments_bdt: Decimal = Decimal("0")

    total_dialed: int = 0
    total_connected: int = 0
    connection_rate_pct: Optional[Decimal] = None
    total_call_duration_minutes: int = 0
    total_outdoor_visits: int = 0
    total_meeting_duration_minutes: int = 0

    total_new_sales: Decimal = Decimal("0")
    total_actual_collection: Decimal = Decimal("0")
    total_sales_commitments: Decimal = Decimal("0")
    total_tb_collection: Decimal = Decimal("0")
    total_tb_commitments: Decimal = Decimal("0")
    total_emi_collection: Decimal = Decimal("0")
    total_emi_commitments: Decimal = Decimal("0")

    by_slot: dict[str, dict[str, int]] = {}
    by_category: dict[str, dict[str, int]] = {}
    lead_category_breakdown: list[LeadCategoryBreakdown] = []


class EmployeeLeaderboardItem(BaseModel):
    rank: int
    employee_id: int
    employee_name: str
    username: str
    reports_count: int
    dialed_calls: int
    dialed_target: int
    dialed_pct: float
    base_dialed_target: Optional[int] = None
    call_reduction: Optional[int] = None
    indoor_cx_count: Optional[int] = None
    connected_calls: int
    connected_target: int
    connected_pct: float
    outdoor_visits: int
    outdoor_target: int
    outdoor_pct: float
    meeting_minutes: int
    actual_collections: float
    collection_target: float
    collection_pct: float
    overall_score_pct: float
    status: str  # "achieved" | "on_track" | "needs_attention" | "behind_pace"
    base_collection_target: Optional[float] = None
    carry_forward_deficit: Optional[float] = None
    monthly_collection_target: Optional[float] = None
    month_to_date_collected: Optional[float] = None


class KPIChampion(BaseModel):
    title: str
    metric: str
    employee_name: str
    value: str


class PerformanceLeaderboardResponse(BaseModel):
    period_start: date
    period_end: date
    team_overall_score_pct: float
    champions: list[KPIChampion]
    rankings: list[EmployeeLeaderboardItem]


class DailyTrendPoint(BaseModel):
    date: str
    label: str
    actual_collection_bdt: float = 0.0
    new_sales_collection_bdt: float = 0.0
    emi_collection_bdt: float = 0.0
    commitments_bdt: float = 0.0
    cumulative_collection_bdt: float = 0.0
    cumulative_commitments_bdt: float = 0.0


class FinancialTrendResponse(BaseModel):
    period_start: date
    period_end: date
    total_actual_collection_bdt: float = 0.0
    total_commitments_bdt: float = 0.0
    total_new_sales_collection_bdt: float = 0.0
    total_emi_collection_bdt: float = 0.0

    # Monthly Target & Pace Forecast
    monthly_target_bdt: float = 0.0
    month_to_date_collected_bdt: float = 0.0
    monthly_pace_pct: float = 0.0
    expected_pace_pct: float = 0.0
    pace_status: str = "on_pace"  # "ahead_of_pace" | "on_pace" | "behind_pace"
    days_in_month: int = 30
    days_elapsed: int = 1
    days_remaining: int = 29
    daily_current_run_rate_bdt: float = 0.0
    daily_run_rate_needed_bdt: float = 0.0
    projected_month_end_bdt: float = 0.0
    projected_achievement_pct: float = 0.0

    # Day-by-day trend points
    trend: list[DailyTrendPoint] = []

