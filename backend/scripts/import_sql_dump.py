"""
Script to import PostgreSQL text dump (sunset_dashboard.sql) into SQLite (sunset_dashboard.db).
Handles COPY public.<table_name> (...) FROM stdin data blocks.
"""
from __future__ import annotations

import os
import re
import sqlite3
import sys

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SQL_FILE = os.path.join(BACKEND_DIR, "sunset_dashboard.sql")
DB_FILE = os.path.join(BACKEND_DIR, "sunset_dashboard.db")

# Table loading order to respect foreign key dependencies
TABLE_ORDER = [
    "teams",
    "users",
    "app_settings",
    "daily_targets",
    "daily_activity_reports",
    "call_activity_entries",
    "meeting_activity_entries",
    "sales_collection_entries",
    "milestone_checkpoints",
    "notices",
]


def parse_dump(sql_path: str) -> dict[str, tuple[list[str], list[list[object]]]]:
    """Parses COPY statements from pg_dump text file."""
    tables_data: dict[str, tuple[list[str], list[list[object]]]] = {}

    with open(sql_path, "r", encoding="utf-8", errors="replace") as f:
        current_table: str | None = None
        current_cols: list[str] = []
        current_rows: list[list[object]] = []

        for line in f:
            if line.startswith("COPY public."):
                m = re.match(r"COPY public\.(\w+)\s*\((.*?)\)\s*FROM stdin;", line)
                if m:
                    current_table = m.group(1)
                    current_cols = [c.strip() for c in m.group(2).split(",")]
                    current_rows = []
                continue

            if current_table:
                if line.strip() == r"\.":
                    tables_data[current_table] = (current_cols, current_rows)
                    current_table = None
                    current_cols = []
                    current_rows = []
                    continue

                raw_line = line.rstrip("\r\n")
                raw_values = raw_line.split("\t")
                row: list[object] = []
                for val in raw_values:
                    if val == r"\N":
                        row.append(None)
                    elif val == "t":
                        row.append(1)
                    elif val == "f":
                        row.append(0)
                    else:
                        # unescape standard pg escapes
                        cleaned = val.replace(r"\n", "\n").replace(r"\t", "\t").replace(r"\\", "\\")
                        row.append(cleaned)
                current_rows.append(row)

    return tables_data


def import_into_sqlite():
    if not os.path.exists(SQL_FILE):
        print(f"Error: SQL file not found at {SQL_FILE}")
        sys.exit(1)

    print(f"Reading and parsing SQL dump: {SQL_FILE}...")
    tables_data = parse_dump(SQL_FILE)
    print(f"Found data for {len(tables_data)} tables: {list(tables_data.keys())}")

    conn = sqlite3.connect(DB_FILE)
    cur = conn.cursor()

    # Disable foreign keys temporarily during import
    cur.execute("PRAGMA foreign_keys = OFF;")

    # First check available tables in SQLite
    cur.execute("SELECT name FROM sqlite_master WHERE type='table';")
    existing_tables = {row[0] for row in cur.fetchall()}

    for table in TABLE_ORDER:
        if table not in tables_data:
            continue
        if table not in existing_tables:
            print(f"Skipping table '{table}' (not present in SQLite schema).")
            continue

        cols, rows = tables_data[table]

        # Get existing columns in SQLite for this table
        cur.execute(f"PRAGMA table_info({table})")
        db_cols = {col[1] for col in cur.fetchall()}

        # Filter cols and rows to only match columns that exist in SQLite
        col_indices = [i for i, c in enumerate(cols) if c in db_cols]
        target_cols = [cols[i] for i in col_indices]

        if not target_cols:
            continue

        filtered_rows = []
        for r in rows:
            filtered_rows.append([r[i] for i in col_indices])

        placeholders = ", ".join(["?"] * len(target_cols))
        col_names = ", ".join(target_cols)
        sql = f"INSERT OR REPLACE INTO {table} ({col_names}) VALUES ({placeholders})"

        cur.executemany(sql, filtered_rows)
        print(f"  + Loaded {len(filtered_rows)} rows into '{table}'.")

    conn.commit()
    cur.execute("PRAGMA foreign_keys = ON;")
    conn.close()
    print("\nImport completed successfully!")


if __name__ == "__main__":
    import_into_sqlite()
