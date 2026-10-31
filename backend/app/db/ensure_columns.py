"""Automatic safe column check/migration on app startup."""
import logging
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

logger = logging.getLogger(__name__)

async def ensure_schema_updates(engine: AsyncEngine, is_sqlite: bool) -> None:
    try:
        async with engine.begin() as conn:
            if is_sqlite:
                result = await conn.execute(text("PRAGMA table_info(sales_collection_entries)"))
                existing_cols = {row[1] for row in result.fetchall()}
                if not existing_cols:
                    return

                if "customer_phone" not in existing_cols:
                    await conn.execute(text("ALTER TABLE sales_collection_entries ADD COLUMN customer_phone VARCHAR(50)"))
                    logger.info("Added customer_phone to sales_collection_entries")
                if "expected_payment_date" not in existing_cols:
                    await conn.execute(text("ALTER TABLE sales_collection_entries ADD COLUMN expected_payment_date DATE"))
                    logger.info("Added expected_payment_date to sales_collection_entries")
                if "reschedule_count" not in existing_cols:
                    await conn.execute(text("ALTER TABLE sales_collection_entries ADD COLUMN reschedule_count INTEGER NOT NULL DEFAULT 0"))
                    logger.info("Added reschedule_count to sales_collection_entries")
                if "reschedule_history" not in existing_cols:
                    await conn.execute(text("ALTER TABLE sales_collection_entries ADD COLUMN reschedule_history JSON"))
                    logger.info("Added reschedule_history to sales_collection_entries")
                if "commitment_percentage" not in existing_cols:
                    await conn.execute(text("ALTER TABLE sales_collection_entries ADD COLUMN commitment_percentage INTEGER"))
                    logger.info("Added commitment_percentage to sales_collection_entries")

                # Ensure users.phone exists
                result_users = await conn.execute(text("PRAGMA table_info(users)"))
                user_cols = {row[1] for row in result_users.fetchall()}
                if user_cols and "phone" not in user_cols:
                    await conn.execute(text("ALTER TABLE users ADD COLUMN phone VARCHAR(50)"))
                    logger.info("Added phone to users table")

                # Ensure daily_targets.emi_target exists
                result_targets = await conn.execute(text("PRAGMA table_info(daily_targets)"))
                target_cols = {row[1] for row in result_targets.fetchall()}
                if target_cols and "emi_target" not in target_cols:
                    await conn.execute(text("ALTER TABLE daily_targets ADD COLUMN emi_target NUMERIC(15, 2)"))
                    logger.info("Added emi_target to daily_targets table")
            else:
                await conn.execute(text("""
                    ALTER TABLE sales_collection_entries 
                    ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(50),
                    ADD COLUMN IF NOT EXISTS expected_payment_date DATE,
                    ADD COLUMN IF NOT EXISTS commitment_percentage INTEGER,
                    ADD COLUMN IF NOT EXISTS reschedule_count INTEGER NOT NULL DEFAULT 0,
                    ADD COLUMN IF NOT EXISTS reschedule_history JSONB;

                    ALTER TABLE users
                    ADD COLUMN IF NOT EXISTS phone VARCHAR(50);

                    ALTER TABLE daily_targets
                    ADD COLUMN IF NOT EXISTS emi_target NUMERIC(15, 2);

                    DO $$
                    BEGIN
                        ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'tl';
                        ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'co';
                    EXCEPTION
                        WHEN undefined_object THEN NULL;
                    END $$;

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
                """))
    except Exception as exc:
        logger.warning("ensure_schema_updates warning (non-fatal): %s", exc)
