"""Teams API endpoints — manage dynamic team hierarchy."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import get_current_user, require_admin
from app.db.session import get_db
from app.models.team import Team
from app.models.user import User
from app.schemas.team import TeamBulkAssign, TeamCreate, TeamRead, TeamUpdate

router = APIRouter(prefix="/teams", tags=["Teams"])


@router.get("", response_model=list[TeamRead])
async def list_teams(
    include_inactive: bool = Query(False),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all teams with current member counts."""
    query = (
        select(
            Team,
            func.count(User.id).label("member_count"),
        )
        .outerjoin(User, (User.team_id == Team.id) & (User.is_active.is_(True)))
        .group_by(Team.id)
        .order_by(Team.display_order.asc(), Team.name.asc())
    )
    if not include_inactive:
        query = query.where(Team.is_active.is_(True))

    result = await db.execute(query)
    rows = result.all()

    teams_out: list[TeamRead] = []
    for team, count in rows:
        team_data = TeamRead(
            id=team.id,
            name=team.name,
            director_name=team.director_name,
            display_order=team.display_order,
            is_active=team.is_active,
            member_count=count or 0,
            created_at=team.created_at,
            updated_at=team.updated_at,
        )
        teams_out.append(team_data)
    return teams_out


@router.post("", response_model=TeamRead, status_code=status.HTTP_201_CREATED)
async def create_team(
    data: TeamCreate,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Create a new team (admin only)."""
    # Check duplicate name
    existing = await db.execute(select(Team).where(func.lower(Team.name) == data.name.strip().lower()))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Team with name '{data.name}' already exists",
        )

    team = Team(
        name=data.name.strip(),
        director_name=data.director_name.strip() if data.director_name else None,
        display_order=data.display_order,
        is_active=data.is_active,
    )
    db.add(team)
    await db.commit()
    await db.refresh(team)
    return TeamRead(
        id=team.id,
        name=team.name,
        director_name=team.director_name,
        display_order=team.display_order,
        is_active=team.is_active,
        member_count=0,
        created_at=team.created_at,
        updated_at=team.updated_at,
    )


@router.put("/{team_id}", response_model=TeamRead)
async def update_team(
    team_id: int,
    data: TeamUpdate,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Update team details such as name, director name, display order, or active state."""
    team = await db.get(Team, team_id)
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

    if data.name is not None and data.name.strip() != team.name:
        existing = await db.execute(
            select(Team).where(
                (func.lower(Team.name) == data.name.strip().lower()) & (Team.id != team_id)
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Team with name '{data.name}' already exists",
            )
        team.name = data.name.strip()

    if data.director_name is not None:
        team.director_name = data.director_name.strip() if data.director_name else None
    if data.display_order is not None:
        team.display_order = data.display_order
    if data.is_active is not None:
        team.is_active = data.is_active

    await db.commit()
    await db.refresh(team)

    # Count members
    member_res = await db.execute(
        select(func.count(User.id)).where((User.team_id == team_id) & (User.is_active.is_(True)))
    )
    count = member_res.scalar() or 0

    return TeamRead(
        id=team.id,
        name=team.name,
        director_name=team.director_name,
        display_order=team.display_order,
        is_active=team.is_active,
        member_count=count,
        created_at=team.created_at,
        updated_at=team.updated_at,
    )


@router.delete("/{team_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_team(
    team_id: int,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Delete a team and unassign all assigned members."""
    team = await db.get(Team, team_id)
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

    # Unassign users first
    await db.execute(
        update(User).where(User.team_id == team_id).values(team_id=None)
    )
    await db.delete(team)
    await db.commit()


@router.post("/{team_id}/assign")
async def bulk_assign_team(
    team_id: int,
    payload: TeamBulkAssign,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Bulk assign a list of employees to a team, with optional role and supervisor assignment."""
    team = await db.get(Team, team_id)
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

    if payload.employee_ids:
        update_vals: dict[str, Any] = {"team_id": team_id}
        if payload.role:
            update_vals["role"] = payload.role
        if payload.reporting_manager_id is not None:
            update_vals["reporting_manager_id"] = (
                payload.reporting_manager_id if payload.reporting_manager_id > 0 else None
            )

        await db.execute(
            update(User)
            .where(User.id.in_(payload.employee_ids))
            .values(**update_vals)
        )
        await db.commit()

    role_str = f" as {payload.role.value}" if payload.role else ""
    return {"message": f"Successfully assigned {len(payload.employee_ids)} staff to {team.name}{role_str}"}

