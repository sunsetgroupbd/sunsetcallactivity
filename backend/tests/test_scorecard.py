"""Tests for Monthly Executive Scorecard service and endpoints."""
from __future__ import annotations

from decimal import Decimal
from datetime import date
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.call_activity import CallActivityEntry
from app.models.meeting_activity import MeetingActivityEntry
from app.models.report import DailyActivityReport, ReportStatus
from app.models.sales_collection import SalesCollectionEntry
from app.models.targets import DailyTargets
from app.models.user import User, UserRole
from tests.conftest import admin_headers, emp_headers


@pytest.fixture
async def tl_user(db: AsyncSession) -> User:
    user = User(
        full_name="Team Leader One",
        email="tl1@sunsetgroup.com",
        username="tl1",
        password_hash=hash_password("TlPass123"),
        role=UserRole.TL,
        is_active=True,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


@pytest.fixture
async def subordinate_employee(db: AsyncSession, tl_user: User) -> User:
    user = User(
        full_name="Subordinate Executive",
        email="subemp@sunsetgroup.com",
        username="subemp",
        password_hash=hash_password("SubPass123"),
        role=UserRole.EMPLOYEE,
        reporting_manager_id=tl_user.id,
        is_active=True,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


@pytest.mark.asyncio
async def test_scorecard_aggregation_and_cash_vs_commitment_separation(
    client: AsyncClient, db: AsyncSession, employee_user: User
):
    """
    Verify:
    1. Cash collections (new_sales, tb, emi) are computed properly.
    2. Commitments (commit_payment, booking_commit) are NEVER summed into actual collections.
    3. Call slots and meeting counts are aggregated correctly for Till 5th / Till 10th.
    """
    headers = await emp_headers(client, employee_user)

    # Configure target
    target = DailyTargets(
        employee_id=employee_user.id,
        effective_from=date(2026, 11, 1),
        sales_target=Decimal("1500000.00"),
    )
    db.add(target)

    # Day 3 report (within Till 5th)
    r1 = DailyActivityReport(
        employee_id=employee_user.id,
        report_date=date(2026, 11, 3),
        status=ReportStatus.SUBMITTED,
    )
    db.add(r1)
    await db.flush()

    # Day 3: Actual Cash Collections
    sc1 = SalesCollectionEntry(
        report_id=r1.id,
        category="new_sales_collection",
        amount=Decimal("300000.00"),
        lead_source="fair",
    )
    sc2 = SalesCollectionEntry(
        report_id=r1.id,
        category="emi_collection",
        amount=Decimal("50000.00"),
    )
    # Day 3: Future Commitment (MUST NOT BE ADDED TO ACTUAL COLLECTIONS)
    sc3 = SalesCollectionEntry(
        report_id=r1.id,
        category="new_sales_commit_payment",
        amount=Decimal("700000.00"),
        notes="Customer promise hold",
    )
    # Day 3: Calls & Meetings
    ce1 = CallActivityEntry(
        report_id=r1.id,
        lead_category="fair_leads",
        slot_10am_1pm=10,
        slot_2pm_5pm=15,
        slot_5pm_6pm=5,
        total_dialed=30,
        lead_status_hp=3,
        lead_status_p=5,
        lead_status_fub=2,
    )
    me1 = MeetingActivityEntry(
        report_id=r1.id,
        activity_type="outdoor_visit_count",
        total_count=2,
    )
    me2 = MeetingActivityEntry(
        report_id=r1.id,
        activity_type="indoor_cx_count",
        total_count=1,
    )
    db.add_all([sc1, sc2, sc3, ce1, me1, me2])

    # Day 8 report (in Till 10th, after Till 5th)
    r2 = DailyActivityReport(
        employee_id=employee_user.id,
        report_date=date(2026, 11, 8),
        status=ReportStatus.SUBMITTED,
    )
    db.add(r2)
    await db.flush()

    sc4 = SalesCollectionEntry(
        report_id=r2.id,
        category="tb_collection",
        amount=Decimal("100000.00"),
        lead_source="facebook",
    )
    db.add(sc4)
    await db.flush()

    # Fetch scorecard
    resp = await client.get(f"/api/v1/scorecards/{employee_user.id}?month=2026-11", headers=headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()

    # Check header
    assert data["header"]["employee_name"] == employee_user.full_name
    assert data["header"]["month"] == "2026-11"

    periods = data["periods"]
    till_5 = next(p for p in periods if p["label"] == "Till 5th")
    till_10 = next(p for p in periods if p["label"] == "Till 10th")

    # Till 5th: Day 3 collections only (300k new sales + 50k emi = 350k total)
    # The 700k commitment MUST NOT be in actual collections
    assert Decimal(till_5["new_sales"]) == Decimal("300000.00")
    assert Decimal(till_5["emi"]) == Decimal("50000.00")
    assert Decimal(till_5["tb"]) == Decimal("0.00")
    assert Decimal(till_5["total_collection"]) == Decimal("350000.00")
    assert till_5["total_calls_dialed"] == 30
    assert till_5["current_fair_lead"] == 30
    assert till_5["hp"] == 3
    assert till_5["p"] == 5
    assert till_5["fup"] == 2
    assert till_5["out_done"] == 2
    assert till_5["in_done"] == 1
    assert Decimal(till_5["sold_fair"]) == Decimal("300000.00")
    assert Decimal(till_5["hold_amount"]) == Decimal("700000.00")

    # Till 10th: Cumulative (300k new sales + 100k TB + 50k emi = 450k total)
    assert Decimal(till_10["new_sales"]) == Decimal("300000.00")
    assert Decimal(till_10["tb"]) == Decimal("100000.00")
    assert Decimal(till_10["emi"]) == Decimal("50000.00")
    assert Decimal(till_10["total_collection"]) == Decimal("450000.00")
    assert Decimal(till_10["sold_fb"]) == Decimal("100000.00")


@pytest.mark.asyncio
async def test_permission_scoping_and_marking_restriction(
    client: AsyncClient,
    admin_user: User,
    tl_user: User,
    subordinate_employee: User,
    employee_user_2: User,
):
    """
    Test permission matrix:
    - Employee can view own scorecard, but CANNOT view unrelated peer's scorecard.
    - Employee CANNOT edit marking (403 forbidden).
    - Supervisor TL can view subordinate scorecard and CAN update marking.
    - Supervisor TL CANNOT view scorecard of employee not in their subtree.
    - Admin can view all non-admin scorecards and edit marking.
    """
    sub_headers = await emp_headers(client, subordinate_employee, "SubPass123")
    tl_headers = await emp_headers(client, tl_user, "TlPass123")
    admin_hdrs = await admin_headers(client, admin_user)

    # 1. Subordinate employee cannot view unrelated peer employee_user_2
    res_peer = await client.get(f"/api/v1/scorecards/{employee_user_2.id}?month=2026-11", headers=sub_headers)
    assert res_peer.status_code == 403

    # 2. Subordinate employee can view own scorecard
    res_own = await client.get(f"/api/v1/scorecards/{subordinate_employee.id}?month=2026-11", headers=sub_headers)
    assert res_own.status_code == 200

    # 3. Subordinate employee CANNOT edit marking (403 Forbidden)
    res_mark_fail = await client.put(
        f"/api/v1/scorecards/{subordinate_employee.id}/2026-11",
        json={"marking": 85},
        headers=sub_headers,
    )
    assert res_mark_fail.status_code == 403

    # But subordinate CAN edit employee forecast / leaves
    res_forecast_ok = await client.put(
        f"/api/v1/scorecards/{subordinate_employee.id}/2026-11",
        json={"prediction_amount": "800000.00", "planned_leave": 2},
        headers=sub_headers,
    )
    assert res_forecast_ok.status_code == 200
    assert Decimal(res_forecast_ok.json()["prediction_amount"]) == Decimal("800000.00")
    assert res_forecast_ok.json()["planned_leave"] == 2

    # 4. Supervisor TL can view subordinate scorecard and CAN edit marking
    res_tl_view = await client.get(f"/api/v1/scorecards/{subordinate_employee.id}?month=2026-11", headers=tl_headers)
    assert res_tl_view.status_code == 200
    assert res_tl_view.json()["can_edit_marking"] is True

    res_tl_mark = await client.put(
        f"/api/v1/scorecards/{subordinate_employee.id}/2026-11",
        json={"marking": 90, "supervisor_notes": "Excellent performance"},
        headers=tl_headers,
    )
    assert res_tl_mark.status_code == 200
    assert res_tl_mark.json()["marking"] == 90
    assert res_tl_mark.json()["supervisor_notes"] == "Excellent performance"

    # 5. Supervisor TL CANNOT view unrelated employee_user_2
    res_tl_peer = await client.get(f"/api/v1/scorecards/{employee_user_2.id}?month=2026-11", headers=tl_headers)
    assert res_tl_peer.status_code == 403

    # 6. Admin can view all and edit marking
    res_adm_view = await client.get(f"/api/v1/scorecards/{employee_user_2.id}?month=2026-11", headers=admin_hdrs)
    assert res_adm_view.status_code == 200

    res_adm_mark = await client.put(
        f"/api/v1/scorecards/{employee_user_2.id}/2026-11",
        json={"marking": 75},
        headers=admin_hdrs,
    )
    assert res_adm_mark.status_code == 200
    assert res_adm_mark.json()["marking"] == 75


@pytest.mark.asyncio
async def test_admin_exclusion_and_scorecard_not_allowed_for_admin(
    client: AsyncClient, admin_user: User
):
    """Admin roles are excluded from scorecards."""
    admin_hdrs = await admin_headers(client, admin_user)

    # Attempting to load scorecard for admin returns 400
    resp = await client.get(f"/api/v1/scorecards/{admin_user.id}?month=2026-11", headers=admin_hdrs)
    assert resp.status_code == 400
    assert "not applicable for Administrator" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_table_2_customer_plan_crud_and_probability_validation(
    client: AsyncClient, subordinate_employee: User
):
    """
    Verify customer collection plan CRUD:
    - Adding customer row computes total_collection = new_sales + tb + emi.
    - Probability must be multiple of 10 between 10 and 100.
    """
    headers = await emp_headers(client, subordinate_employee, "SubPass123")

    # Load scorecard to ensure it exists
    sc_res = await client.get(f"/api/v1/scorecards/{subordinate_employee.id}?month=2026-11", headers=headers)
    sc_id = sc_res.json()["id"]

    # Invalid probability (not a multiple of 10)
    bad_cust = {
        "customer_name": "Test Customer",
        "new_sales_amount": "200000.00",
        "tb_amount": "50000.00",
        "emi_amount": "25000.00",
        "collection_probability": 45,  # Invalid
    }
    bad_res = await client.post(f"/api/v1/scorecards/{sc_id}/customers", json=bad_cust, headers=headers)
    assert bad_res.status_code == 422

    # Valid customer plan row
    good_cust = {
        "customer_name": "Mr. Rafiqul Islam",
        "paid_amount": "50000.00",
        "unpaid_amount": "225000.00",
        "collection_date": "2026-11-20",
        "in_out_plan": "Outdoor Visit",
        "new_sales_amount": "200000.00",
        "tb_amount": "50000.00",
        "emi_amount": "25000.00",
        "new_lead_status": "HP",
        "collection_probability": 80,
        "remarks": "Promised on site visit",
    }
    create_res = await client.post(f"/api/v1/scorecards/{sc_id}/customers", json=good_cust, headers=headers)
    assert create_res.status_code == 201
    created_cust = create_res.json()
    cust_id = created_cust["id"]
    # Total collection must be sum: 200k + 50k + 25k = 275k
    assert Decimal(created_cust["total_collection"]) == Decimal("275000.00")

    # Update customer row
    upd_res = await client.put(
        f"/api/v1/scorecards/customers/{cust_id}",
        json={"tb_amount": "100000.00", "collection_probability": 90},
        headers=headers,
    )
    assert upd_res.status_code == 200, upd_res.text
    # New sum: 200k + 100k + 25k = 325k
    assert Decimal(upd_res.json()["total_collection"]) == Decimal("325000.00")
    assert upd_res.json()["collection_probability"] == 90

    # Delete customer row
    del_res = await client.delete(f"/api/v1/scorecards/customers/{cust_id}", headers=headers)
    assert del_res.status_code == 204


@pytest.mark.asyncio
async def test_close_month_freezes_snapshot(
    client: AsyncClient, tl_user: User, subordinate_employee: User
):
    """
    Closing a month:
    1. Only supervisor/admin can close.
    2. Freezes snapshot_data so subsequent edits are locked.
    """
    sub_headers = await emp_headers(client, subordinate_employee, "SubPass123")
    tl_headers = await emp_headers(client, tl_user, "TlPass123")

    # Subordinate employee cannot close scorecard
    res_close_fail = await client.post(
        f"/api/v1/scorecards/{subordinate_employee.id}/2026-11/close",
        headers=sub_headers,
    )
    assert res_close_fail.status_code == 403

    # Supervisor TL can close scorecard
    res_close_ok = await client.post(
        f"/api/v1/scorecards/{subordinate_employee.id}/2026-11/close",
        headers=tl_headers,
    )
    assert res_close_ok.status_code == 200
    assert res_close_ok.json()["status"] == "closed"

    # Attempting to edit closed scorecard fails with 400
    res_edit_fail = await client.put(
        f"/api/v1/scorecards/{subordinate_employee.id}/2026-11",
        json={"prediction_amount": "999999.00"},
        headers=sub_headers,
    )
    assert res_edit_fail.status_code == 400
    assert "closed and locked" in res_edit_fail.json()["detail"]


@pytest.mark.asyncio
async def test_team_rollup_endpoint(
    client: AsyncClient, tl_user: User, subordinate_employee: User, admin_user: User
):
    """Test team rollup endpoint respecting caller's scope."""
    tl_headers = await emp_headers(client, tl_user, "TlPass123")
    admin_hdrs = await admin_headers(client, admin_user)

    # TL sees subordinate in team rollup
    res_tl = await client.get("/api/v1/scorecards/team?month=2026-11", headers=tl_headers)
    assert res_tl.status_code == 200
    data_tl = res_tl.json()
    emp_ids_tl = [item["employee_id"] for item in data_tl["items"]]
    assert subordinate_employee.id in emp_ids_tl

    # Admin rollup includes executives and excludes admin
    res_adm = await client.get("/api/v1/scorecards/team?month=2026-11", headers=admin_hdrs)
    assert res_adm.status_code == 200
    data_adm = res_adm.json()
    adm_ids = [item["employee_id"] for item in data_adm["items"]]
    assert admin_user.id not in adm_ids
