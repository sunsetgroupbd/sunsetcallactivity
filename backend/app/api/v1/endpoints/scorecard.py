"""Scorecard API endpoints."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.scorecard import (
    MonthlyScorecardResponse,
    MonthlyScorecardUpdateRequest,
    ScorecardCustomerCreate,
    ScorecardCustomerRead,
    ScorecardCustomerUpdate,
    ScorecardTeamRollupResponse,
)
from app.services.scorecard_service import ScorecardService

router = APIRouter(prefix="/scorecards", tags=["Scorecard"])


@router.get("/team", response_model=ScorecardTeamRollupResponse)
async def get_team_scorecards(
    month: Optional[str] = Query(None, description="Month in YYYY-MM format"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Rollup scorecards by Group > C.O. > T.L. > Executive respecting caller's scope.
    Admins see all non-admin employees; supervisors see their subordinate tree.
    """
    svc = ScorecardService(db)
    return await svc.get_team_rollup(month_str=month, current_user=current_user)


@router.post("/{scorecard_id}/customers", response_model=ScorecardCustomerRead, status_code=status.HTTP_201_CREATED)
async def add_scorecard_customer_plan(
    scorecard_id: int,
    data: ScorecardCustomerCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a customer collection plan row to Table 2."""
    svc = ScorecardService(db)
    return await svc.add_customer_plan(
        scorecard_id=scorecard_id, data=data, current_user=current_user
    )


@router.put("/customers/{customer_id}", response_model=ScorecardCustomerRead)
@router.put("/{scorecard_id}/customers/{customer_id}", response_model=ScorecardCustomerRead)
async def update_scorecard_customer_plan(
    customer_id: int,
    data: ScorecardCustomerUpdate,
    scorecard_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an existing customer collection plan row."""
    svc = ScorecardService(db)
    return await svc.update_customer_plan(
        customer_id=customer_id, data=data, current_user=current_user
    )


@router.delete("/customers/{customer_id}", status_code=status.HTTP_204_NO_CONTENT)
@router.delete("/{scorecard_id}/customers/{customer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_scorecard_customer_plan(
    customer_id: int,
    scorecard_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a customer collection plan row."""
    svc = ScorecardService(db)
    await svc.delete_customer_plan(customer_id=customer_id, current_user=current_user)
    return None


@router.get("/{employee_id}", response_model=MonthlyScorecardResponse)
async def get_employee_scorecard(
    employee_id: int,
    month: Optional[str] = Query(None, description="Month in YYYY-MM format"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Retrieve full scorecard for an employee:
    - Header: Name, TL, CO, Team, Position (from hierarchy data)
    - Table 1: Previous months & cumulative checkpoints (Till 5th, 10th...)
    - Table 2: Customer collection plan
    - Portfolio snapshot & manual inputs
    """
    svc = ScorecardService(db)
    return await svc.get_scorecard_detail(
        employee_id=employee_id, month_str=month, current_user=current_user
    )


@router.put("/{employee_id}/{month}", response_model=MonthlyScorecardResponse)
async def update_employee_scorecard(
    employee_id: int,
    month: str,
    data: MonthlyScorecardUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Update scorecard manual inputs (forecast, leave, portfolio).
    Marking and evaluation scores can ONLY be updated by a supervisor or admin.
    """
    svc = ScorecardService(db)
    return await svc.update_scorecard(
        employee_id=employee_id,
        month_str=month,
        data=data,
        current_user=current_user,
    )


@router.post("/{employee_id}/{month}/close", response_model=MonthlyScorecardResponse)
async def close_employee_scorecard(
    employee_id: int,
    month: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Close and freeze a scorecard for the given month (Supervisor / Admin only).
    Permanently snapshots Table 1 and Table 2 figures.
    """
    svc = ScorecardService(db)
    return await svc.close_scorecard(
        employee_id=employee_id,
        month_str=month,
        current_user=current_user,
    )
