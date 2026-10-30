"""Tests for report lifecycle, permissions, and duplicate prevention."""
from __future__ import annotations

import pytest
from httpx import AsyncClient

from tests.conftest import admin_headers, emp_headers


@pytest.mark.asyncio
async def test_create_report(client: AsyncClient, employee_user):
    headers = await emp_headers(client, employee_user)
    resp = await client.post(
        "/api/v1/reports",
        json={"report_date": "2026-01-15"},
        headers=headers,
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["report_date"] == "2026-01-15"
    assert body["status"] == "draft"
    assert body["employee_id"] == employee_user.id


@pytest.mark.asyncio
async def test_duplicate_report_returns_existing(client: AsyncClient, employee_user):
    headers = await emp_headers(client, employee_user)
    resp1 = await client.post(
        "/api/v1/reports",
        json={"report_date": "2026-01-16"},
        headers=headers,
    )
    assert resp1.status_code == 201
    resp2 = await client.post(
        "/api/v1/reports",
        json={"report_date": "2026-01-16"},
        headers=headers,
    )
    assert resp2.status_code in (200, 201)
    assert resp2.json()["id"] == resp1.json()["id"]


@pytest.mark.asyncio
async def test_employee_cannot_read_other_report(
    client: AsyncClient, employee_user, employee_user_2
):
    # emp1 creates a report
    h1 = await emp_headers(client, employee_user)
    r = await client.post(
        "/api/v1/reports",
        json={"report_date": "2026-01-17"},
        headers=h1,
    )
    report_id = r.json()["id"]

    # emp2 tries to read it
    h2 = await emp_headers(client, employee_user_2, "EmpPass456")
    resp = await client.get(f"/api/v1/reports/{report_id}", headers=h2)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_admin_can_read_any_report(
    client: AsyncClient, employee_user, admin_user
):
    # emp creates a report
    h_emp = await emp_headers(client, employee_user)
    r = await client.post(
        "/api/v1/reports",
        json={"report_date": "2026-01-18"},
        headers=h_emp,
    )
    report_id = r.json()["id"]

    # admin reads it
    h_admin = await admin_headers(client, admin_user)
    resp = await client.get(f"/api/v1/reports/{report_id}", headers=h_admin)
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_submit_report(client: AsyncClient, employee_user):
    headers = await emp_headers(client, employee_user)
    r = await client.post(
        "/api/v1/reports",
        json={"report_date": "2026-01-19"},
        headers=headers,
    )
    report_id = r.json()["id"]

    resp = await client.post(f"/api/v1/reports/{report_id}/submit", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "submitted"
    assert resp.json()["submitted_at"] is not None


@pytest.mark.asyncio
async def test_double_submit_rejected(client: AsyncClient, employee_user):
    headers = await emp_headers(client, employee_user)
    r = await client.post(
        "/api/v1/reports",
        json={"report_date": "2026-01-20"},
        headers=headers,
    )
    report_id = r.json()["id"]
    await client.post(f"/api/v1/reports/{report_id}/submit", headers=headers)
    resp = await client.post(f"/api/v1/reports/{report_id}/submit", headers=headers)
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_employee_cannot_edit_submitted_report(
    client: AsyncClient, employee_user
):
    headers = await emp_headers(client, employee_user)
    r = await client.post(
        "/api/v1/reports",
        json={"report_date": "2026-01-21"},
        headers=headers,
    )
    report_id = r.json()["id"]
    await client.post(f"/api/v1/reports/{report_id}/submit", headers=headers)
    resp = await client.put(
        f"/api/v1/reports/{report_id}",
        json={"notes": "Cannot edit"},
        headers=headers,
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_list_reports_employee_sees_own_only(
    client: AsyncClient, employee_user, employee_user_2
):
    h1 = await emp_headers(client, employee_user)
    await client.post("/api/v1/reports", json={"report_date": "2026-02-01"}, headers=h1)

    h2 = await emp_headers(client, employee_user_2, "EmpPass456")
    await client.post("/api/v1/reports", json={"report_date": "2026-02-01"}, headers=h2)

    resp = await client.get("/api/v1/reports", headers=h1)
    assert resp.status_code == 200
    for item in resp.json()["items"]:
        assert item["employee_id"] == employee_user.id
