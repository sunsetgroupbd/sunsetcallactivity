"""Pydantic schemas for Executive Wise Collection Sheet Report."""
from __future__ import annotations

from datetime import date
from typing import Optional, List
from pydantic import BaseModel


class ExecutiveCollectionRow(BaseModel):
    sl_no: Optional[int] = None
    employee_id: Optional[int] = None
    name: str
    position: str = ""
    is_manager: bool = False
    client: int = 0
    share: int = 0
    mgt_given_target: float = 0.0
    achieved: float = 0.0
    achievement_pct: float = 0.0
    dues: float = 0.0
    token: int = 0
    sold_share: int = 0
    new_sales: float = 0.0
    emi: float = 0.0
    total_collection: float = 0.0


class COGroup(BaseModel):
    co_id: Optional[int] = None
    co_name: str
    co_designation: str = ""
    rows: List[ExecutiveCollectionRow] = []
    totals: ExecutiveCollectionRow


class TeamGroup(BaseModel):
    team_id: Optional[int] = None
    team_name: str
    director_name: Optional[str] = None
    co_groups: List[COGroup] = []
    totals: ExecutiveCollectionRow


class ExecutiveCollectionReportResponse(BaseModel):
    report_date: date
    date_display: str
    month_display: str
    date_range_label: str
    teams: List[TeamGroup]
    grand_total: ExecutiveCollectionRow
