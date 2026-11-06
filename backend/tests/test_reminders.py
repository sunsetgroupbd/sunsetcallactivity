"""Tests for Reminders & Notifications endpoint, including Lead Pipeline Risk conditions."""
from __future__ import annotations

import pytest
from httpx import AsyncClient

from tests.conftest import emp_headers, admin_headers
from app.services.reminder_service import get_dhaka_now


async def _make_report(client, headers, date_str: str) -> int:
    r = await client.post("/api/v1/reports", json={"report_date": date_str}, headers=headers)
    return r.json()["id"]


@pytest.mark.asyncio
async def test_lead_pipeline_risk_endpoint(client: AsyncClient, employee_user):
    headers = await emp_headers(client, employee_user)
    today_str = str(get_dhaka_now().date())
    report_id = await _make_report(client, headers, today_str)

    # 1. Upsert call entries below risk thresholds:
    # High Potential: 40 (< 50)
    # Potential: 140 (< 150)
    # Follow Up: 450 (< 500)
    entries = [
        {"lead_category": "High Potential", "till_today_status": 40},
        {"lead_category": "Potential", "till_today_status": 140},
        {"lead_category": "Follow Up", "till_today_status": 450},
    ]
    upsert_resp = await client.put(
        f"/api/v1/reports/{report_id}/calls",
        json={"entries": entries},
        headers=headers,
    )
    assert upsert_resp.status_code == 200

    # 2. Query reminders endpoint
    rem_resp = await client.get("/api/v1/reminders", headers=headers)
    assert rem_resp.status_code == 200
    data = rem_resp.json()

    risk_reminders = [r for r in data["reminders"] if r["type"] == "lead_pipeline_risk"]
    assert len(risk_reminders) == 3

    hp_risk = next(r for r in risk_reminders if r["category"] == "High Potential")
    assert hp_risk["severity"] == "urgent"
    assert "40 < 50" in hp_risk["title"]

    p_risk = next(r for r in risk_reminders if r["category"] == "Potential")
    assert p_risk["severity"] == "warning"
    assert "140 < 150" in p_risk["title"]

    fub_risk = next(r for r in risk_reminders if r["category"] == "Follow Up")
    assert fub_risk["severity"] == "warning"
    assert "450 < 500" in fub_risk["title"]

    # 3. Update to safe values:
    # High Potential: 55 (>= 50)
    # Potential: 160 (>= 150)
    # Follow Up: 520 (>= 500)
    safe_entries = [
        {"lead_category": "High Potential", "till_today_status": 55},
        {"lead_category": "Potential", "till_today_status": 160},
        {"lead_category": "Follow Up", "till_today_status": 520},
    ]
    safe_upsert = await client.put(
        f"/api/v1/reports/{report_id}/calls",
        json={"entries": safe_entries},
        headers=headers,
    )
    assert safe_upsert.status_code == 200

    rem_resp_safe = await client.get("/api/v1/reminders", headers=headers)
    assert rem_resp_safe.status_code == 200
    safe_data = rem_resp_safe.json()

    safe_risk_reminders = [r for r in safe_data["reminders"] if r["type"] == "lead_pipeline_risk"]
    assert len(safe_risk_reminders) == 0


@pytest.mark.asyncio
async def test_dialing_red_flag_employee(client: AsyncClient, employee_user):
    headers = await emp_headers(client, employee_user)
    today_str = str(get_dhaka_now().date())
    report_id = await _make_report(client, headers, today_str)

    # 1. Upsert call entries totaling 60 dialed calls (< 150)
    entries = [
        {
            "lead_category": "High Potential",
            "till_today_status": 60,
            "slot_10am_1pm": 20,
            "slot_2pm_5pm": 20,
            "slot_5pm_6pm": 20,
            "total_dialed": 60,
        }
    ]
    upsert_resp = await client.put(
        f"/api/v1/reports/{report_id}/calls",
        json={"entries": entries},
        headers=headers,
    )
    assert upsert_resp.status_code == 200

    # 2. Check employee reminders: should have dialing_red_flag
    rem_resp = await client.get("/api/v1/reminders", headers=headers)
    assert rem_resp.status_code == 200
    data = rem_resp.json()

    flag_reminders = [r for r in data["reminders"] if r["type"] == "dialing_red_flag"]
    assert len(flag_reminders) == 1
    assert "60 Calls (< 150)" in flag_reminders[0]["title"]
    assert "deficit: 90" in flag_reminders[0]["message"]

    # 3. Update to 160 dialed calls (>= 150)
    safe_entries = [
        {
            "lead_category": "High Potential",
            "till_today_status": 60,
            "slot_10am_1pm": 60,
            "slot_2pm_5pm": 60,
            "slot_5pm_6pm": 40,
            "total_dialed": 160,
        }
    ]
    safe_upsert = await client.put(
        f"/api/v1/reports/{report_id}/calls",
        json={"entries": safe_entries},
        headers=headers,
    )
    assert safe_upsert.status_code == 200

    rem_resp_safe = await client.get("/api/v1/reminders", headers=headers)
    assert rem_resp_safe.status_code == 200
    safe_data = rem_resp_safe.json()

    safe_flag_reminders = [r for r in safe_data["reminders"] if r["type"] == "dialing_red_flag"]
    assert len(safe_flag_reminders) == 0


@pytest.mark.asyncio
async def test_dialing_red_flag_admin(client: AsyncClient, admin_user, employee_user):
    emp_head = await emp_headers(client, employee_user)
    adm_head = await admin_headers(client, admin_user)
    today_str = str(get_dhaka_now().date())
    report_id = await _make_report(client, emp_head, today_str)

    # Upsert employee call entries with 75 calls (< 150)
    entries = [
        {
            "lead_category": "High Potential",
            "till_today_status": 60,
            "slot_10am_1pm": 25,
            "slot_2pm_5pm": 25,
            "slot_5pm_6pm": 25,
            "total_dialed": 75,
        }
    ]
    upsert_resp = await client.put(
        f"/api/v1/reports/{report_id}/calls",
        json={"entries": entries},
        headers=emp_head,
    )
    assert upsert_resp.status_code == 200

    # Query admin reminders: should have dialing_red_flag for staff
    rem_resp = await client.get("/api/v1/reminders", headers=adm_head)
    assert rem_resp.status_code == 200
    data = rem_resp.json()

    admin_flag_reminders = [r for r in data["reminders"] if r["type"] == "dialing_red_flag"]
    assert len(admin_flag_reminders) == 1
    assert "Staff Dialing Red Flags (< 150 Calls)" in admin_flag_reminders[0]["title"]
