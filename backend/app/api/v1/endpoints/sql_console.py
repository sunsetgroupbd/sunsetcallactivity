"""SQL Console and Importer endpoint for Administrators."""
from __future__ import annotations

import re
import time
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_admin
from app.db.session import get_db
from app.models.user import User
from app.schemas.sql_console import (
    ColumnInfo,
    QueryExecuteRequest,
    QueryExecuteResponse,
    QueryResult,
    SchemaOverviewResponse,
    SqlImportResponse,
    TableSchemaInfo,
)

router = APIRouter(prefix="/sql-console", tags=["SQL Console"])


def split_sql_statements(sql: str) -> list[str]:
    """Splits SQL text into distinct executable statements, preserving quotes."""
    statements = []
    current: list[str] = []
    in_single_quote = False
    in_double_quote = False
    in_line_comment = False
    in_block_comment = False
    i = 0
    length = len(sql)

    while i < length:
        ch = sql[i]
        next_ch = sql[i + 1] if i + 1 < length else ""

        # Handle comments
        if in_line_comment:
            if ch == "\n":
                in_line_comment = False
            i += 1
            continue
        elif in_block_comment:
            if ch == "*" and next_ch == "/":
                in_block_comment = False
                i += 2
                continue
            i += 1
            continue
        else:
            if ch == "-" and next_ch == "-":
                in_line_comment = True
                i += 2
                continue
            if ch == "/" and next_ch == "*":
                in_block_comment = True
                i += 2
                continue

        # Handle quotes
        if ch == "'" and not in_double_quote:
            in_single_quote = not in_single_quote
        elif ch == '"' and not in_single_quote:
            in_double_quote = not in_double_quote

        # Handle statement boundary
        if ch == ";" and not in_single_quote and not in_double_quote:
            stmt = "".join(current).strip()
            if stmt:
                statements.append(stmt)
            current = []
            i += 1
            continue

        current.append(ch)
        i += 1

    remaining = "".join(current).strip()
    if remaining:
        statements.append(remaining)

    return statements


def parse_pg_copy_dump(sql_text: str) -> dict[str, tuple[list[str], list[list[Any]]]]:
    """Extracts tables, columns, and rows from PostgreSQL COPY public.<table_name> statements."""
    tables_data: dict[str, tuple[list[str], list[list[Any]]]] = {}
    lines = sql_text.splitlines()

    current_table: str | None = None
    current_cols: list[str] = []
    current_rows: list[list[Any]] = []

    for line in lines:
        if line.startswith("COPY public.") or line.startswith("COPY "):
            m = re.match(r"COPY (?:public\.)?(\w+)\s*\((.*?)\)\s*FROM stdin;", line)
            if m:
                current_table = m.group(1)
                current_cols = [c.strip() for c in m.group(2).split(",")]
                current_rows = []
            continue

        if current_table is not None:
            if line.strip() == r"\.":
                tables_data[current_table] = (current_cols, current_rows)
                current_table = None
                current_cols = []
                current_rows = []
                continue

            raw_values = line.split("\t")
            row: list[Any] = []
            for val in raw_values:
                if val == r"\N":
                    row.append(None)
                elif val == "t":
                    row.append(1)
                elif val == "f":
                    row.append(0)
                else:
                    # unescape PostgreSQL strings
                    cleaned = val.replace(r"\n", "\n").replace(r"\t", "\t").replace(r"\\", "\\")
                    row.append(cleaned)
            current_rows.append(row)

    return tables_data


@router.post("/execute", response_model=QueryExecuteResponse)
async def execute_query(
    body: QueryExecuteRequest,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> QueryExecuteResponse:
    """Executes one or more SQL queries, returning results or affected rows."""
    raw_query = body.query.strip()
    if not raw_query:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Query cannot be empty")

    statements = split_sql_statements(raw_query)
    if not statements:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No valid SQL statements found")

    start_time = time.perf_counter()
    results: list[QueryResult] = []

    try:
        for stmt in statements:
            res = await db.execute(text(stmt))

            if res.returns_rows:
                cols = list(res.keys())
                # Limit to 500 rows per query for safety in browser view
                fetched = res.fetchmany(500)
                rows: list[list[Any]] = []
                for r in fetched:
                    row_vals = []
                    for v in r:
                        if isinstance(v, (int, float, bool, str)) or v is None:
                            row_vals.append(v)
                        else:
                            row_vals.append(str(v))
                    rows.append(row_vals)

                results.append(
                    QueryResult(
                        statement=stmt[:150] + ("..." if len(stmt) > 150 else ""),
                        is_select=True,
                        columns=cols,
                        rows=rows,
                        rows_count=len(rows),
                        message=f"Returned {len(rows)} row(s)",
                    )
                )
            else:
                rowcount = res.rowcount if res.rowcount is not None and res.rowcount >= 0 else 0
                results.append(
                    QueryResult(
                        statement=stmt[:150] + ("..." if len(stmt) > 150 else ""),
                        is_select=False,
                        rows_affected=rowcount,
                        message=f"Statement executed successfully ({rowcount} row(s) affected)",
                    )
                )

        await db.commit()
        exec_ms = round((time.perf_counter() - start_time) * 1000, 2)
        return QueryExecuteResponse(
            success=True,
            execution_time_ms=exec_ms,
            results=results,
        )

    except Exception as exc:
        await db.rollback()
        exec_ms = round((time.perf_counter() - start_time) * 1000, 2)
        return QueryExecuteResponse(
            success=False,
            execution_time_ms=exec_ms,
            results=results,
            error=str(exc),
        )


@router.get("/schema", response_model=SchemaOverviewResponse)
async def get_database_schema(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> SchemaOverviewResponse:
    """Inspects all tables and column definitions in the active database."""
    conn = await db.connection()
    dialect = conn.dialect.name
    tables_info: list[TableSchemaInfo] = []

    if dialect == "sqlite":
        # SQLite schema inspection
        tables_res = await db.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
        )
        table_names = [r[0] for r in tables_res.fetchall()]

        for tbl in table_names:
            # Columns
            col_res = await db.execute(text(f"PRAGMA table_info({tbl})"))
            cols: list[ColumnInfo] = []
            for c in col_res.fetchall():
                # c = (cid, name, type, notnull, dflt_value, pk)
                cols.append(
                    ColumnInfo(
                        name=c[1],
                        type=c[2] or "TEXT",
                        primary_key=bool(c[5]),
                        nullable=not bool(c[3]),
                    )
                )

            # Count
            try:
                cnt_res = await db.execute(text(f"SELECT COUNT(*) FROM {tbl}"))
                row_count = cnt_res.scalar() or 0
            except Exception:
                row_count = 0

            tables_info.append(
                TableSchemaInfo(
                    name=tbl,
                    row_count=row_count,
                    columns=cols,
                )
            )

    else:
        # PostgreSQL / Generic SQL inspection
        tables_res = await db.execute(
            text("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name")
        )
        table_names = [r[0] for r in tables_res.fetchall()]

        for tbl in table_names:
            col_res = await db.execute(
                text(
                    "SELECT column_name, data_type, is_nullable "
                    "FROM information_schema.columns "
                    "WHERE table_schema = 'public' AND table_name = :tbl "
                    "ORDER BY ordinal_position"
                ),
                {"tbl": tbl},
            )
            cols = [
                ColumnInfo(
                    name=c[0],
                    type=c[1],
                    nullable=(c[2] == "YES"),
                )
                for c in col_res.fetchall()
            ]

            try:
                cnt_res = await db.execute(text(f"SELECT COUNT(*) FROM {tbl}"))
                row_count = cnt_res.scalar() or 0
            except Exception:
                row_count = 0

            tables_info.append(
                TableSchemaInfo(
                    name=tbl,
                    row_count=row_count,
                    columns=cols,
                )
            )

    return SchemaOverviewResponse(
        database_type=dialect,
        tables=tables_info,
    )


@router.post("/import-file", response_model=SqlImportResponse)
async def import_sql_file(
    file: UploadFile = File(...),
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> SqlImportResponse:
    """Imports a .sql file or PostgreSQL dump into the database."""
    content_bytes = await file.read()
    content = content_bytes.decode("utf-8", errors="replace")

    start_time = time.perf_counter()
    tables_imported: list[dict[str, Any]] = []
    errors: list[str] = []
    statements_executed = 0

    conn = await db.connection()
    dialect = conn.dialect.name

    # Check if this is a PostgreSQL dump with COPY ... FROM stdin
    if "FROM stdin;" in content and ("COPY public." in content or "COPY " in content):
        copy_data = parse_pg_copy_dump(content)
        if copy_data:
            for table_name, (cols, rows) in copy_data.items():
                if not rows:
                    continue
                try:
                    # Get table columns
                    if dialect == "sqlite":
                        cur_info = await db.execute(text(f"PRAGMA table_info({table_name})"))
                        db_cols = {c[1] for c in cur_info.fetchall()}
                    else:
                        cur_info = await db.execute(
                            text(
                                "SELECT column_name FROM information_schema.columns "
                                "WHERE table_name = :tbl AND table_schema = 'public'"
                            ),
                            {"tbl": table_name},
                        )
                        db_cols = {c[0] for c in cur_info.fetchall()}

                    if not db_cols:
                        errors.append(f"Table '{table_name}' does not exist in active database. Skipped.")
                        continue

                    # Filter cols present in DB
                    valid_indices = [i for i, c in enumerate(cols) if c in db_cols]
                    target_cols = [cols[i] for i in valid_indices]
                    if not target_cols:
                        continue

                    # Insert row by row or in batches
                    col_names = ", ".join(target_cols)
                    if dialect == "sqlite":
                        placeholders = ", ".join([f":v{i}" for i in range(len(target_cols))])
                        insert_sql = f"INSERT OR REPLACE INTO {table_name} ({col_names}) VALUES ({placeholders})"
                    else:
                        placeholders = ", ".join([f":v{i}" for i in range(len(target_cols))])
                        insert_sql = f"INSERT INTO {table_name} ({col_names}) VALUES ({placeholders}) ON CONFLICT DO NOTHING"

                    count_inserted = 0
                    for row in rows:
                        row_dict = {f"v{i}": row[idx] for i, idx in enumerate(valid_indices)}
                        await db.execute(text(insert_sql), row_dict)
                        count_inserted += 1

                    await db.commit()
                    tables_imported.append({"table": table_name, "rows": count_inserted})
                    statements_executed += count_inserted

                except Exception as exc:
                    await db.rollback()
                    errors.append(f"Error importing table '{table_name}': {str(exc)}")

            exec_ms = round((time.perf_counter() - start_time) * 1000, 2)
            return SqlImportResponse(
                success=len(errors) == 0 or len(tables_imported) > 0,
                message=f"PostgreSQL dump parsed: {len(tables_imported)} tables loaded.",
                statements_executed=statements_executed,
                tables_imported=tables_imported,
                execution_time_ms=exec_ms,
                errors=errors,
            )

    # Standard SQL statements file
    statements = split_sql_statements(content)
    try:
        for stmt in statements:
            await db.execute(text(stmt))
            statements_executed += 1
        await db.commit()
        exec_ms = round((time.perf_counter() - start_time) * 1000, 2)
        return SqlImportResponse(
            success=True,
            message=f"Successfully executed {statements_executed} SQL statements.",
            statements_executed=statements_executed,
            tables_imported=tables_imported,
            execution_time_ms=exec_ms,
            errors=[],
        )
    except Exception as exc:
        await db.rollback()
        exec_ms = round((time.perf_counter() - start_time) * 1000, 2)
        return SqlImportResponse(
            success=False,
            message="Failed while executing SQL statements.",
            statements_executed=statements_executed,
            tables_imported=tables_imported,
            execution_time_ms=exec_ms,
            errors=[str(exc)],
        )
