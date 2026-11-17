"""Tests for SQL Console and Importer endpoint."""
from __future__ import annotations

import io
import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.user import User


@pytest.mark.asyncio
async def test_admin_can_execute_query_and_inspect_schema(
    client: AsyncClient,
    admin_user: User,
    db: AsyncSession,
):
    from tests.conftest import admin_headers
    headers = await admin_headers(client, admin_user)

    # 1. Inspect schema
    resp = await client.get("/api/v1/sql-console/schema", headers=headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "database_type" in data
    assert "tables" in data
    table_names = [t["name"] for t in data["tables"]]
    assert "users" in table_names

    # 2. Execute SELECT query
    exec_resp = await client.post(
        "/api/v1/sql-console/execute",
        headers=headers,
        json={"query": "SELECT username, role FROM users LIMIT 5;"},
    )
    assert exec_resp.status_code == 200, exec_resp.text
    exec_data = exec_resp.json()
    assert exec_data["success"] is True
    assert len(exec_data["results"]) == 1
    res = exec_data["results"][0]
    assert res["is_select"] is True
    assert "username" in res["columns"]
    assert len(res["rows"]) >= 1

    # 3. Execute DDL / DML query
    ddl_resp = await client.post(
        "/api/v1/sql-console/execute",
        headers=headers,
        json={"query": "CREATE TABLE test_tbl (id INTEGER PRIMARY KEY, note TEXT); INSERT INTO test_tbl VALUES (1, 'hello');"},
    )
    assert ddl_resp.status_code == 200, ddl_resp.text
    ddl_data = ddl_resp.json()
    assert ddl_data["success"] is True
    assert len(ddl_data["results"]) == 2

    # Clean up created table and admin user so next test setup doesn't fail unique email
    await db.execute(text("DROP TABLE IF EXISTS test_tbl"))
    await db.execute(text("DELETE FROM users"))
    await db.commit()


@pytest.mark.asyncio
async def test_employee_cannot_access_sql_console(
    client: AsyncClient,
    employee_user: User,
    db: AsyncSession,
):
    from tests.conftest import get_token
    token = await get_token(client, employee_user.username, "EmpPass123")
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.get("/api/v1/sql-console/schema", headers=headers)
    assert resp.status_code == 403

    resp2 = await client.post(
        "/api/v1/sql-console/execute",
        headers=headers,
        json={"query": "SELECT 1;"},
    )
    assert resp2.status_code == 403

    await db.execute(text("DELETE FROM users"))
    await db.commit()


@pytest.mark.asyncio
async def test_import_sql_file(
    client: AsyncClient,
    admin_user: User,
    db: AsyncSession,
):
    from tests.conftest import admin_headers
    headers = await admin_headers(client, admin_user)

    sql_content = """
    CREATE TABLE import_test (id INTEGER PRIMARY KEY, val TEXT);
    INSERT INTO import_test (id, val) VALUES (1, 'alpha');
    INSERT INTO import_test (id, val) VALUES (2, 'beta');
    """
    files = {"file": ("test.sql", io.BytesIO(sql_content.encode("utf-8")), "text/plain")}

    resp = await client.post(
        "/api/v1/sql-console/import-file",
        headers=headers,
        files=files,
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["success"] is True
    assert data["statements_executed"] == 3

    await db.execute(text("DROP TABLE IF EXISTS import_test"))
    await db.execute(text("DELETE FROM users"))
    await db.commit()
