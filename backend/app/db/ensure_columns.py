"""Automatic safe column check/migration on app startup."""
import logging
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

logger = logging.getLogger(__name__)


async def ensure_schema_updates(engine: AsyncEngine, is_sqlite: bool) -> None:
    if is_sqlite:
        try:
            async with engine.begin() as conn:
                result = await conn.execute(text("PRAGMA table_info(sales_collection_entries)"))
                existing_cols = {row[1] for row in result.fetchall()}
                if not existing_cols:
                    return

                for col_name, col_type in [
                    ("customer_phone", "VARCHAR(50)"),
                    ("expected_payment_date", "DATE"),
                    ("commitment_percentage", "INTEGER"),
                    ("reschedule_count", "INTEGER NOT NULL DEFAULT 0"),
                    ("reschedule_history", "JSON"),
                ]:
                    if col_name not in existing_cols:
                        try:
                            await conn.execute(text(f"ALTER TABLE sales_collection_entries ADD COLUMN {col_name} {col_type}"))
                            logger.info("Added %s to sales_collection_entries", col_name)
                        except Exception as e:
                            logger.warning("Error adding %s to sales_collection_entries: %s", col_name, e)

                # Ensure users.phone exists
                result_users = await conn.execute(text("PRAGMA table_info(users)"))
                user_cols = {row[1] for row in result_users.fetchall()}
                if user_cols and "phone" not in user_cols:
                    try:
                        await conn.execute(text("ALTER TABLE users ADD COLUMN phone VARCHAR(50)"))
                        logger.info("Added phone to users table")
                    except Exception as e:
                        logger.warning("Error adding phone to users: %s", e)

                # Ensure daily_targets.emi_target exists
                result_targets = await conn.execute(text("PRAGMA table_info(daily_targets)"))
                target_cols = {row[1] for row in result_targets.fetchall()}
                if target_cols and "emi_target" not in target_cols:
                    try:
                        await conn.execute(text("ALTER TABLE daily_targets ADD COLUMN emi_target NUMERIC(15, 2)"))
                        logger.info("Added emi_target to daily_targets table")
                    except Exception as e:
                        logger.warning("Error adding emi_target to daily_targets: %s", e)
        except Exception as exc:
            logger.warning("ensure_schema_updates sqlite warning: %s", exc)
    else:
        # PostgreSQL: execute each ALTER statement separately because asyncpg forbids multiple statements in one query
        pg_statements = [
            "ALTER TABLE sales_collection_entries ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(50)",
            "ALTER TABLE sales_collection_entries ADD COLUMN IF NOT EXISTS expected_payment_date DATE",
            "ALTER TABLE sales_collection_entries ADD COLUMN IF NOT EXISTS commitment_percentage INTEGER",
            "ALTER TABLE sales_collection_entries ADD COLUMN IF NOT EXISTS reschedule_count INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE sales_collection_entries ADD COLUMN IF NOT EXISTS reschedule_history JSONB",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50)",
            "ALTER TABLE daily_targets ADD COLUMN IF NOT EXISTS emi_target NUMERIC(15, 2)",
            """
            DO $$
            BEGIN
                ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'tl';
                ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'co';
            EXCEPTION
                WHEN undefined_object THEN NULL;
            END $$;
            """,
            """
            DO $$
            BEGIN
                ALTER TABLE daily_activity_reports DROP CONSTRAINT IF EXISTS daily_activity_reports_employee_id_fkey;
                ALTER TABLE daily_activity_reports ADD CONSTRAINT daily_activity_reports_employee_id_fkey 
                    FOREIGN KEY (employee_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE;

                ALTER TABLE daily_targets DROP CONSTRAINT IF EXISTS daily_targets_employee_id_fkey;
                ALTER TABLE daily_targets ADD CONSTRAINT daily_targets_employee_id_fkey 
                    FOREIGN KEY (employee_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE;

                ALTER TABLE notices DROP CONSTRAINT IF EXISTS notices_created_by_id_fkey;
                ALTER TABLE notices ADD CONSTRAINT notices_created_by_id_fkey 
                    FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;

                ALTER TABLE notices DROP CONSTRAINT IF EXISTS notices_approved_by_id_fkey;
                ALTER TABLE notices ADD CONSTRAINT notices_approved_by_id_fkey 
                    FOREIGN KEY (approved_by_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;
            EXCEPTION
                WHEN OTHERS THEN NULL;
            END $$;
            """,
        ]

        for stmt_str in pg_statements:
            try:
                async with engine.begin() as conn:
                    await conn.execute(text(stmt_str.strip()))
            except Exception as e:
                logger.warning("Postgres schema update step error (non-fatal): %s -> %s", stmt_str[:60], e)

    # Seed default KPI rules in app_settings if not present
    try:
        async with engine.begin() as conn:
            for key, val, desc in [
                ("indoor_cx_call_credit", "35", "Calls deducted from target per day with indoor CX meeting (Once-Per-Day)"),
                ("outdoor_visit_call_credit", "70", "Calls deducted from target per day with outdoor visit (Once-Per-Day)"),
            ]:
                check_stmt = text("SELECT id FROM app_settings WHERE namespace = 'kpi_rules' AND key = :key")
                res = await conn.execute(check_stmt, {"key": key})
                if not res.fetchone():
                    ins_stmt = text("""
                        INSERT INTO app_settings (namespace, key, value, description)
                        VALUES ('kpi_rules', :key, :value, :desc)
                    """)
                    await conn.execute(ins_stmt, {"key": key, "value": val, "desc": desc})
                    logger.info("Initialized default KPI rule: %s = %s", key, val)
    except Exception as e:
        logger.warning("Could not seed app_settings kpi_rules: %s", e)
