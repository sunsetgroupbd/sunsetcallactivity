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

                # Ensure users.phone, users.designation, users.team_id, users.reporting_manager_id, users.client_share_count exist
                result_users = await conn.execute(text("PRAGMA table_info(users)"))
                user_cols = {row[1] for row in result_users.fetchall()}
                if user_cols and "phone" not in user_cols:
                    try:
                        await conn.execute(text("ALTER TABLE users ADD COLUMN phone VARCHAR(50)"))
                        logger.info("Added phone to users table")
                    except Exception as e:
                        logger.warning("Error adding phone to users: %s", e)

                if user_cols and "designation" not in user_cols:
                    try:
                        await conn.execute(text("ALTER TABLE users ADD COLUMN designation VARCHAR(150)"))
                        logger.info("Added designation to users table")
                    except Exception as e:
                        logger.warning("Error adding designation to users: %s", e)

                if user_cols and "team_id" not in user_cols:
                    try:
                        await conn.execute(text("ALTER TABLE users ADD COLUMN team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL"))
                        logger.info("Added team_id to users table")
                    except Exception as e:
                        logger.warning("Error adding team_id to users: %s", e)

                if user_cols and "reporting_manager_id" not in user_cols:
                    try:
                        await conn.execute(text("ALTER TABLE users ADD COLUMN reporting_manager_id INTEGER REFERENCES users(id) ON DELETE SET NULL"))
                        logger.info("Added reporting_manager_id to users table")
                    except Exception as e:
                        logger.warning("Error adding reporting_manager_id to users: %s", e)

                if user_cols and "client_count" not in user_cols:
                    try:
                        await conn.execute(text("ALTER TABLE users ADD COLUMN client_count INTEGER NOT NULL DEFAULT 0"))
                        logger.info("Added client_count to users table")
                    except Exception as e:
                        logger.warning("Error adding client_count to users: %s", e)

                if user_cols and "client_share_count" not in user_cols:
                    try:
                        await conn.execute(text("ALTER TABLE users ADD COLUMN client_share_count INTEGER NOT NULL DEFAULT 0"))
                        logger.info("Added client_share_count to users table")
                    except Exception as e:
                        logger.warning("Error adding client_share_count to users: %s", e)

                # Ensure teams table exists for dynamic team hierarchy
                await conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS teams (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name VARCHAR(100) NOT NULL UNIQUE,
                        director_name VARCHAR(150),
                        display_order INTEGER NOT NULL DEFAULT 0,
                        is_active BOOLEAN NOT NULL DEFAULT 1,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """))
                await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_teams_name ON teams(name)"))

                # Seed default teams if empty
                res_teams = await conn.execute(text("SELECT COUNT(*) FROM teams"))
                team_count = res_teams.scalar() or 0
                if team_count == 0:
                    await conn.execute(text("""
                        INSERT INTO teams (name, director_name, display_order, is_active)
                        VALUES 
                            ('Gazi Sir Team', 'Gazi Sir', 1, 1),
                            ('Hasib Sir Team', 'Hasib Sir', 2, 1)
                    """))
                    logger.info("Seeded default teams: Gazi Sir Team and Hasib Sir Team")

                # Ensure daily_targets.emi_target exists
                result_targets = await conn.execute(text("PRAGMA table_info(daily_targets)"))
                target_cols = {row[1] for row in result_targets.fetchall()}
                if target_cols and "emi_target" not in target_cols:
                    try:
                        await conn.execute(text("ALTER TABLE daily_targets ADD COLUMN emi_target NUMERIC(15, 2)"))
                        logger.info("Added emi_target to daily_targets table")
                    except Exception as e:
                        logger.warning("Error adding emi_target to daily_targets: %s", e)

                # Ensure milestone_checkpoints table exists for admin review sessions
                await conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS milestone_checkpoints (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        month VARCHAR(7) NOT NULL,
                        employee_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                        checkpoint_day INTEGER NOT NULL,
                        label VARCHAR(50) NOT NULL,
                        new_sales NUMERIC(15, 2) NOT NULL DEFAULT 0.0,
                        emi NUMERIC(15, 2) NOT NULL DEFAULT 0.0,
                        total_collection NUMERIC(15, 2) NOT NULL DEFAULT 0.0,
                        total_lead INTEGER NOT NULL DEFAULT 0,
                        fair_lead INTEGER NOT NULL DEFAULT 0,
                        fb_lead INTEGER NOT NULL DEFAULT 0,
                        hp INTEGER NOT NULL DEFAULT 0,
                        p INTEGER NOT NULL DEFAULT 0,
                        fup INTEGER NOT NULL DEFAULT 0,
                        outdoor_visits INTEGER NOT NULL DEFAULT 0,
                        indoor_cx INTEGER NOT NULL DEFAULT 0,
                        total_calls INTEGER NOT NULL DEFAULT 0,
                        sold_fair NUMERIC(15, 2) NOT NULL DEFAULT 0.0,
                        sold_fb NUMERIC(15, 2) NOT NULL DEFAULT 0.0,
                        sold_other NUMERIC(15, 2) NOT NULL DEFAULT 0.0,
                        gl VARCHAR(100),
                        hold NUMERIC(15, 2) NOT NULL DEFAULT 0.0,
                        cancel NUMERIC(15, 2) NOT NULL DEFAULT 0.0,
                        admin_notes TEXT,
                        updated_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """))
                await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_mc_month ON milestone_checkpoints(month)"))
                await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_mc_emp ON milestone_checkpoints(employee_id)"))

                result_mc = await conn.execute(text("PRAGMA table_info(milestone_checkpoints)"))
                mc_cols = {row[1] for row in result_mc.fetchall()}
                for col_name, col_type in [
                    ("total_calls", "INTEGER DEFAULT 0"),
                    ("sold_fair", "NUMERIC(15, 2) DEFAULT 0.0"),
                    ("sold_fb", "NUMERIC(15, 2) DEFAULT 0.0"),
                    ("sold_other", "NUMERIC(15, 2) DEFAULT 0.0"),
                    ("gl", "VARCHAR(100)"),
                    ("hold", "NUMERIC(15, 2) DEFAULT 0.0"),
                    ("cancel", "NUMERIC(15, 2) DEFAULT 0.0"),
                ]:
                    if mc_cols and col_name not in mc_cols:
                        try:
                            await conn.execute(text(f"ALTER TABLE milestone_checkpoints ADD COLUMN {col_name} {col_type}"))
                        except Exception:
                            pass
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
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS designation VARCHAR(150)",
            """
            CREATE TABLE IF NOT EXISTS teams (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL UNIQUE,
                director_name VARCHAR(150),
                display_order INTEGER NOT NULL DEFAULT 0,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
            """,
            "CREATE INDEX IF NOT EXISTS ix_teams_name ON teams(name)",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS reporting_manager_id INTEGER REFERENCES users(id) ON DELETE SET NULL",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS client_count INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS client_share_count INTEGER NOT NULL DEFAULT 0",
            """
            INSERT INTO teams (name, director_name, display_order, is_active)
            VALUES 
                ('Gazi Sir Team', 'Gazi Sir', 1, TRUE),
                ('Hasib Sir Team', 'Hasib Sir', 2, TRUE)
            ON CONFLICT (name) DO NOTHING
            """,
            "ALTER TABLE daily_targets ADD COLUMN IF NOT EXISTS emi_target NUMERIC(15, 2)",
            """
            CREATE TABLE IF NOT EXISTS milestone_checkpoints (
                id SERIAL PRIMARY KEY,
                month VARCHAR(7) NOT NULL,
                employee_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                checkpoint_day INTEGER NOT NULL,
                label VARCHAR(50) NOT NULL,
                new_sales NUMERIC(15, 2) NOT NULL DEFAULT 0.0,
                emi NUMERIC(15, 2) NOT NULL DEFAULT 0.0,
                total_collection NUMERIC(15, 2) NOT NULL DEFAULT 0.0,
                total_lead INTEGER NOT NULL DEFAULT 0,
                fair_lead INTEGER NOT NULL DEFAULT 0,
                fb_lead INTEGER NOT NULL DEFAULT 0,
                hp INTEGER NOT NULL DEFAULT 0,
                p INTEGER NOT NULL DEFAULT 0,
                fup INTEGER NOT NULL DEFAULT 0,
                outdoor_visits INTEGER NOT NULL DEFAULT 0,
                indoor_cx INTEGER NOT NULL DEFAULT 0,
                total_calls INTEGER NOT NULL DEFAULT 0,
                sold_fair NUMERIC(15, 2) NOT NULL DEFAULT 0.0,
                sold_fb NUMERIC(15, 2) NOT NULL DEFAULT 0.0,
                sold_other NUMERIC(15, 2) NOT NULL DEFAULT 0.0,
                gl VARCHAR(100),
                hold NUMERIC(15, 2) NOT NULL DEFAULT 0.0,
                cancel NUMERIC(15, 2) NOT NULL DEFAULT 0.0,
                admin_notes TEXT,
                updated_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
            """,
            "CREATE INDEX IF NOT EXISTS ix_mc_month ON milestone_checkpoints(month)",
            "CREATE INDEX IF NOT EXISTS ix_mc_emp ON milestone_checkpoints(employee_id)",
            "ALTER TABLE milestone_checkpoints ADD COLUMN IF NOT EXISTS total_calls INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE milestone_checkpoints ADD COLUMN IF NOT EXISTS sold_fair NUMERIC(15, 2) NOT NULL DEFAULT 0.0",
            "ALTER TABLE milestone_checkpoints ADD COLUMN IF NOT EXISTS sold_fb NUMERIC(15, 2) NOT NULL DEFAULT 0.0",
            "ALTER TABLE milestone_checkpoints ADD COLUMN IF NOT EXISTS sold_other NUMERIC(15, 2) NOT NULL DEFAULT 0.0",
            "ALTER TABLE milestone_checkpoints ADD COLUMN IF NOT EXISTS gl VARCHAR(100)",
            "ALTER TABLE milestone_checkpoints ADD COLUMN IF NOT EXISTS hold NUMERIC(15, 2) NOT NULL DEFAULT 0.0",
            "ALTER TABLE milestone_checkpoints ADD COLUMN IF NOT EXISTS cancel NUMERIC(15, 2) NOT NULL DEFAULT 0.0",
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
