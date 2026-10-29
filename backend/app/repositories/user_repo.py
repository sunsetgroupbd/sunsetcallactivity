"""UserRepository — database access for User model."""
from __future__ import annotations

from typing import Optional, Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User, UserRole


class UserRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_by_id(self, user_id: int) -> Optional[User]:
        result = await self.db.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()

    async def get_by_username(self, username: str) -> Optional[User]:
        result = await self.db.execute(
            select(User).where(User.username == username)
        )
        return result.scalar_one_or_none()

    async def get_by_email(self, email: str) -> Optional[User]:
        result = await self.db.execute(select(User).where(User.email == email))
        return result.scalar_one_or_none()

    async def get_by_username_or_email(self, login: str) -> Optional[User]:
        """Look up by username OR email — used for login."""
        result = await self.db.execute(
            select(User).where(
                (User.username == login) | (User.email == login)
            )
        )
        return result.scalar_one_or_none()

    async def list_all(
        self,
        role: Optional[UserRole] = None,
        is_active: Optional[bool] = None,
        search: Optional[str] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> Sequence[User]:
        stmt = select(User)
        if role is not None:
            stmt = stmt.where(User.role == role)
        if is_active is not None:
            stmt = stmt.where(User.is_active == is_active)
        if search and search.strip():
            pattern = f"%{search.strip()}%"
            stmt = stmt.where(
                (User.full_name.ilike(pattern))
                | (User.username.ilike(pattern))
                | (User.email.ilike(pattern))
                | (User.phone.ilike(pattern))
            )
        stmt = stmt.offset(skip).limit(limit).order_by(User.id)
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def count_all(
        self,
        role: Optional[UserRole] = None,
        is_active: Optional[bool] = None,
        search: Optional[str] = None,
    ) -> int:
        from sqlalchemy import func
        stmt = select(func.count(User.id))
        if role is not None:
            stmt = stmt.where(User.role == role)
        if is_active is not None:
            stmt = stmt.where(User.is_active == is_active)
        if search and search.strip():
            pattern = f"%{search.strip()}%"
            stmt = stmt.where(
                (User.full_name.ilike(pattern))
                | (User.username.ilike(pattern))
                | (User.email.ilike(pattern))
                | (User.phone.ilike(pattern))
            )
        result = await self.db.execute(stmt)
        return result.scalar_one()

    async def get_next_employee_id(self) -> int:
        """
        Generate year-based numeric employee ID with 4 digits after the year: YYYY0001, YYYY0002, etc. (e.g. 20260001).
        Automatically updates year when calendar year changes (e.g. 20260001 -> 20270001 in 2027).
        """
        from datetime import datetime, timezone, timedelta
        from sqlalchemy import func

        # Business timezone: Asia/Dhaka is UTC+6
        dhaka_year = (datetime.now(timezone.utc) + timedelta(hours=6)).year
        base_id = dhaka_year * 10000  # e.g. 20260000
        max_id_limit = (dhaka_year + 1) * 10000  # e.g. 20270000

        # Find maximum existing ID in this year's 8-digit range (e.g. 20260001 - 20269999)
        stmt = select(func.max(User.id)).where(
            User.id >= base_id,
            User.id < max_id_limit,
        )
        res = await self.db.execute(stmt)
        max_id = res.scalar_one_or_none()

        if max_id is not None and max_id >= (base_id + 1):
            return max_id + 1

        # Check existing 7-digit IDs from old 3-digit scheme (e.g. 2026001 - 2026999)
        old_base_id = dhaka_year * 1000
        old_max_limit = (dhaka_year + 1) * 1000
        stmt_old = select(func.max(User.id)).where(
            User.id >= old_base_id,
            User.id < old_max_limit,
        )
        try:
            res_old = await self.db.execute(stmt_old)
            old_max = res_old.scalar_one_or_none()
        except Exception:
            old_max = None

        if old_max is not None and old_max >= (old_base_id + 1):
            seq = old_max - old_base_id
            return base_id + seq + 1

        # Check legacy short IDs (< 100000) created in the current year
        year_start = datetime(dhaka_year, 1, 1)
        year_end = datetime(dhaka_year + 1, 1, 1)
        stmt_legacy = select(func.max(User.id)).where(
            User.id < 100000,
            User.created_at >= year_start,
            User.created_at < year_end,
        )
        try:
            res_legacy = await self.db.execute(stmt_legacy)
            legacy_max = res_legacy.scalar_one_or_none()
        except Exception:
            legacy_max = None

        legacy_seq = legacy_max if legacy_max and legacy_max > 0 else 0
        return base_id + legacy_seq + 1

    async def create(self, user: User) -> User:
        if not user.id:
            user.id = await self.get_next_employee_id()
        self.db.add(user)
        await self.db.flush()
        await self.db.refresh(user)
        return user

    async def update(self, user: User) -> User:
        self.db.add(user)
        await self.db.flush()
        await self.db.refresh(user)
        return user

    async def change_employee_id(self, old_id: int, new_id: int) -> User:
        """
        Safely update an employee's numeric ID from old_id to new_id,
        updating all referencing records (reports, targets, notices) in sync.
        """
        from sqlalchemy import text
        from app.core.config import settings

        user = await self.get_by_id(old_id)
        if not user:
            raise ValueError(f"User {old_id} not found")

        # Double check new_id does not exist
        existing = await self.get_by_id(new_id)
        if existing and existing.id != old_id:
            raise ValueError(f"Employee ID {new_id} is already in use by {existing.full_name}")

        is_sqlite = settings.is_sqlite
        if is_sqlite:
            await self.db.execute(text("PRAGMA foreign_keys = OFF;"))
            try:
                await self.db.execute(
                    text("UPDATE users SET id = :new_id WHERE id = :old_id"),
                    {"new_id": new_id, "old_id": old_id},
                )
                await self.db.execute(
                    text("UPDATE daily_activity_reports SET employee_id = :new_id WHERE employee_id = :old_id"),
                    {"new_id": new_id, "old_id": old_id},
                )
                await self.db.execute(
                    text("UPDATE daily_targets SET employee_id = :new_id WHERE employee_id = :old_id"),
                    {"new_id": new_id, "old_id": old_id},
                )
                await self.db.execute(
                    text("UPDATE notices SET created_by_id = :new_id WHERE created_by_id = :old_id"),
                    {"new_id": new_id, "old_id": old_id},
                )
                await self.db.execute(
                    text("UPDATE notices SET approved_by_id = :new_id WHERE approved_by_id = :old_id"),
                    {"new_id": new_id, "old_id": old_id},
                )
                await self.db.flush()
            finally:
                await self.db.execute(text("PRAGMA foreign_keys = ON;"))
        else:
            try:
                await self.db.execute(
                    text("UPDATE users SET id = :new_id WHERE id = :old_id"),
                    {"new_id": new_id, "old_id": old_id},
                )
                await self.db.flush()
            except Exception:
                await self.db.rollback()
                await self.db.execute(text("""
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
                await self.db.execute(
                    text("UPDATE users SET id = :new_id WHERE id = :old_id"),
                    {"new_id": new_id, "old_id": old_id},
                )
                await self.db.flush()

        self.db.expire_all()
        updated_user = await self.get_by_id(new_id)
        if not updated_user:
            raise ValueError(f"User {new_id} could not be re-fetched after ID update")
        return updated_user

    async def delete(self, user: User) -> None:
        from app.models.report import DailyActivityReport
        from app.models.targets import DailyTargets

        # Cleanly delete all associated reports for this employee
        # (their call_entries, meeting_entries, and sales_collection_entries cascade automatically)
        reports_stmt = select(DailyActivityReport).where(DailyActivityReport.employee_id == user.id)
        reports_res = await self.db.execute(reports_stmt)
        reports = list(reports_res.scalars().all())
        for r in reports:
            await self.db.delete(r)

        # Cleanly delete associated targets for this employee
        targets_stmt = select(DailyTargets).where(DailyTargets.employee_id == user.id)
        targets_res = await self.db.execute(targets_stmt)
        for t in list(targets_res.scalars().all()):
            await self.db.delete(t)

        await self.db.delete(user)
        await self.db.flush()
