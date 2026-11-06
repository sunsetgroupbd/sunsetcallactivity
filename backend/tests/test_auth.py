"""Tests for authentication endpoints."""
from __future__ import annotations

import pytest
from httpx import AsyncClient

from tests.conftest import admin_headers, get_token


@pytest.mark.asyncio
async def test_login_success(client: AsyncClient, admin_user):
    resp = await client.post(
        "/api/v1/auth/login",
        data={"username": admin_user.username, "password": "AdminPass123"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "access_token" in body
    assert body["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_login_with_employee_id(client: AsyncClient, employee_user):
    # 1. Login with raw numeric ID
    resp_raw = await client.post(
        "/api/v1/auth/login",
        data={"username": str(employee_user.id), "password": "EmpPass123"},
    )
    assert resp_raw.status_code == 200
    assert "access_token" in resp_raw.json()

    # 2. Login with 8-digit year format (e.g. 20260000 + id)
    year_id = f"2026{str(employee_user.id).zfill(4)}"
    resp_8digit = await client.post(
        "/api/v1/auth/login",
        data={"username": year_id, "password": "EmpPass123"},
    )
    assert resp_8digit.status_code == 200
    assert "access_token" in resp_8digit.json()

    # 3. Login with prefixed format (e.g. EMP-20260001)
    resp_prefixed = await client.post(
        "/api/v1/auth/login",
        data={"username": f"EMP-{year_id}", "password": "EmpPass123"},
    )
    assert resp_prefixed.status_code == 200
    assert "access_token" in resp_prefixed.json()


@pytest.mark.asyncio
async def test_login_with_email(client: AsyncClient, employee_user):
    resp = await client.post(
        "/api/v1/auth/login",
        data={"username": employee_user.email, "password": "EmpPass123"},
    )
    assert resp.status_code == 200
    assert "access_token" in resp.json()


@pytest.mark.asyncio
async def test_login_wrong_password(client: AsyncClient, admin_user):
    resp = await client.post(
        "/api/v1/auth/login",
        data={"username": admin_user.username, "password": "WrongPass!"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_unknown_user(client: AsyncClient):
    resp = await client.post(
        "/api/v1/auth/login",
        data={"username": "nobody", "password": "any"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_me_authenticated(client: AsyncClient, admin_user):
    headers = await admin_headers(client, admin_user)
    resp = await client.get("/api/v1/auth/me", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["username"] == admin_user.username


@pytest.mark.asyncio
async def test_me_unauthenticated(client: AsyncClient):
    resp = await client.get("/api/v1/auth/me")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_me_invalid_token(client: AsyncClient):
    resp = await client.get(
        "/api/v1/auth/me", headers={"Authorization": "Bearer invalid.token.here"}
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_logout(client: AsyncClient, admin_user):
    headers = await admin_headers(client, admin_user)
    resp = await client.post("/api/v1/auth/logout", headers=headers)
    assert resp.status_code == 200
    assert "successfully" in resp.json()["message"].lower()
