"""
Import all models here so that SQLAlchemy's metadata is fully populated
before Alembic or the lifespan hook calls Base.metadata.create_all().
"""
from app.db.base_class import Base  # noqa: F401

# Import every model module so their mappers are registered
from app.models.user import User  # noqa: F401
from app.models.report import DailyActivityReport  # noqa: F401
from app.models.call_activity import CallActivityEntry  # noqa: F401
from app.models.meeting_activity import MeetingActivityEntry  # noqa: F401
from app.models.sales_collection import SalesCollectionEntry  # noqa: F401
from app.models.targets import DailyTargets  # noqa: F401
from app.models.settings import AppSettings  # noqa: F401
from app.models.notice import Notice  # noqa: F401
from app.models.milestone_checkpoint import MilestoneCheckpoint  # noqa: F401
