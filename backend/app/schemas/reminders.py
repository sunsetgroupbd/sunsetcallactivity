"""Reminders and Notifications Pydantic Schemas."""
from __future__ import annotations

from typing import List, Optional
from pydantic import BaseModel


class ReminderItem(BaseModel):
    id: str
    type: str  # "follow_up_today" | "follow_up_overdue" | "report_submission" | "commitment_due" | "slot_nudge" | "lead_pipeline_risk" | "dialing_red_flag"
    severity: str  # "urgent" | "warning" | "info"
    title: str
    message: str
    client_name: Optional[str] = None
    phone_number: Optional[str] = None
    category: Optional[str] = None
    date: Optional[str] = None
    link: Optional[str] = None
    action_label: Optional[str] = None


class ReminderSummary(BaseModel):
    total_count: int
    follow_ups_today_count: int
    overdue_count: int
    unsubmitted_report: bool
    slot_nudge: Optional[str] = None


class RemindersResponse(BaseModel):
    summary: ReminderSummary
    reminders: List[ReminderItem]
