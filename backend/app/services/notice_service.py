"""Service layer for Notice Board business logic."""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notice import Notice, NoticePriority, NoticeStatus, NoticeType
from app.models.user import User, UserRole
from app.repositories.notice_repo import NoticeRepository
from app.schemas.notice import NoticeApproval, NoticeRead

backend_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
UPLOAD_DIR = os.path.join(backend_root, "uploads", "notices")
os.makedirs(UPLOAD_DIR, exist_ok=True)


class NoticeService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.repo = NoticeRepository(db)

    def _to_read_dto(self, notice: Notice, current_user: User) -> NoticeRead:
        """Convert Notice model to NoticeRead DTO, hiding internal approval notes from regular employees."""
        is_management = current_user.role in (UserRole.ADMIN, UserRole.SUB_ADMIN)
        return NoticeRead(
            id=notice.id,
            title=notice.title,
            notice_type=notice.notice_type,
            content=notice.content,
            file_url=notice.file_url,
            file_name=notice.file_name,
            status=notice.status,
            priority=notice.priority,
            created_by_id=notice.created_by_id,
            created_by_name=notice.created_by.full_name if notice.created_by else None,
            approved_by_id=notice.approved_by_id,
            approved_by_name=notice.approved_by.full_name if notice.approved_by else None,
            approval_note=notice.approval_note if is_management else None,  # Strictly hidden from employees
            approved_at=notice.approved_at,
            created_at=notice.created_at,
            updated_at=notice.updated_at,
        )

    async def list_notices(
        self,
        current_user: User,
        status_filter: Optional[NoticeStatus] = None,
        notice_type: Optional[NoticeType] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> List[NoticeRead]:
        is_management = current_user.role in (UserRole.ADMIN, UserRole.SUB_ADMIN)

        # Regular employees can ONLY see published notices
        if not is_management:
            status_filter = NoticeStatus.PUBLISHED

        notices = await self.repo.list_notices(
            status=status_filter,
            notice_type=notice_type,
            skip=skip,
            limit=limit,
        )
        return [self._to_read_dto(n, current_user) for n in notices]

    async def get_notice(self, notice_id: int, current_user: User) -> NoticeRead:
        notice = await self.repo.get_by_id(notice_id)
        if not notice:
            raise HTTPException(status_code=404, detail="Notice not found")

        is_management = current_user.role in (UserRole.ADMIN, UserRole.SUB_ADMIN)
        if not is_management and notice.status != NoticeStatus.PUBLISHED:
            raise HTTPException(status_code=403, detail="Notice is pending approval")

        return self._to_read_dto(notice, current_user)

    async def create_text_notice(
        self,
        title: str,
        content: str,
        priority: NoticePriority,
        current_user: User,
    ) -> NoticeRead:
        if current_user.role not in (UserRole.ADMIN, UserRole.SUB_ADMIN):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only administrators and sub-admins can issue notices",
            )

        # If sub-admins exist in system, text notices require approval.
        # Otherwise, they are published directly.
        has_sub_admins = await self.repo.has_active_sub_admins()
        initial_status = NoticeStatus.PENDING_APPROVAL if has_sub_admins else NoticeStatus.PUBLISHED

        notice = Notice(
            title=title,
            notice_type=NoticeType.TEXT,
            content=content,
            priority=priority,
            status=initial_status,
            created_by_id=current_user.id,
        )
        saved = await self.repo.create(notice)
        await self.db.commit()
        return self._to_read_dto(saved, current_user)

    async def create_pdf_notice(
        self,
        title: str,
        file: UploadFile,
        priority: NoticePriority,
        current_user: User,
    ) -> NoticeRead:
        if current_user.role not in (UserRole.ADMIN, UserRole.SUB_ADMIN):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only administrators and sub-admins can issue notices",
            )

        if not file.filename.lower().endswith(".pdf"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uploaded file must be a PDF document",
            )

        # Save uploaded PDF file to disk
        file_ext = os.path.splitext(file.filename)[1]
        unique_name = f"{uuid.uuid4().hex}{file_ext}"
        file_path = os.path.join(UPLOAD_DIR, unique_name)

        content_bytes = await file.read()
        with open(file_path, "wb") as f:
            f.write(content_bytes)

        file_url = f"/uploads/notices/{unique_name}"

        # PDF notices do NOT require approval; immediately published
        notice = Notice(
            title=title,
            notice_type=NoticeType.PDF,
            content=None,
            file_url=file_url,
            file_name=file.filename,
            priority=priority,
            status=NoticeStatus.PUBLISHED,
            created_by_id=current_user.id,
        )
        saved = await self.repo.create(notice)
        await self.db.commit()
        return self._to_read_dto(saved, current_user)

    async def review_notice(
        self,
        notice_id: int,
        approval_data: NoticeApproval,
        current_user: User,
    ) -> NoticeRead:
        """Sub-admin or admin reviews and approves/rejects notice with internal note."""
        if current_user.role not in (UserRole.ADMIN, UserRole.SUB_ADMIN):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only administrators or sub-administrators can review notices",
            )

        notice = await self.repo.get_by_id(notice_id)
        if not notice:
            raise HTTPException(status_code=404, detail="Notice not found")

        notice.status = approval_data.status
        notice.approval_note = approval_data.approval_note
        notice.approved_by_id = current_user.id
        notice.approved_at = datetime.now(timezone.utc)

        updated = await self.repo.update(notice)
        await self.db.commit()
        return self._to_read_dto(updated, current_user)

    async def delete_notice(self, notice_id: int, current_user: User) -> None:
        if current_user.role not in (UserRole.ADMIN, UserRole.SUB_ADMIN):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only administrators or sub-administrators can delete notices",
            )

        notice = await self.repo.get_by_id(notice_id)
        if not notice:
            raise HTTPException(status_code=404, detail="Notice not found")

        # Clean up PDF file if exists
        if notice.file_url and notice.file_url.startswith("/uploads/notices/"):
            filename = os.path.basename(notice.file_url)
            file_path = os.path.join(UPLOAD_DIR, filename)
            if os.path.exists(file_path):
                try:
                    os.remove(file_path)
                except Exception:
                    pass

        await self.repo.delete(notice)
        await self.db.commit()
