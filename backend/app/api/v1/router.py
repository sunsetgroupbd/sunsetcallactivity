"""Main v1 API router — aggregates all endpoint routers."""
from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.endpoints import (
    auth,
    calls,
    dashboard,
    employees,
    meetings,
    reports,
    sales_collections,
    settings,
    reminders,
    notices,
    teams,
)

api_router = APIRouter()

api_router.include_router(auth.router)
api_router.include_router(reports.router)
api_router.include_router(calls.router)
api_router.include_router(meetings.router)
api_router.include_router(sales_collections.router)
api_router.include_router(dashboard.router)
api_router.include_router(employees.router)
api_router.include_router(settings.router)
api_router.include_router(reminders.router)
api_router.include_router(notices.router)
api_router.include_router(teams.router)
