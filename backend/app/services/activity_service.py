"""Сервис ленты активности."""

import uuid

from sqlalchemy import select

from app.db.models import Activity, User
from app.db.session import AsyncSession


class ActivityService:
    def __init__(self, session: AsyncSession, redis) -> None:
        self.session = session
        self.redis = redis

    async def record(
        self,
        task_id: uuid.UUID | None,
        action: str,
        summary: str,
        actor_id: uuid.UUID | None = None,
    ) -> None:
        activity = Activity(
            task_id=task_id,
            actor_id=actor_id or uuid.uuid4(),
            action=action,
            summary=summary,
        )
        self.session.add(activity)
        await self.session.commit()

    async def recent(self, limit: int = 50) -> dict:
        result = await self.session.execute(
            select(Activity, User.name.label("actor_name"))
            .outerjoin(User, User.id == Activity.actor_id)
            .order_by(Activity.created_at.desc())
            .limit(limit)
        )
        rows = result.all()
        return {
            "items": [
                {
                    "id": str(a.id),
                    "task_id": str(a.task_id) if a.task_id else None,
                    "actor_id": str(a.actor_id),
                    "actor_name": actor_name or "Система",
                    "action": a.action,
                    "summary": a.summary,
                    "created_at": a.created_at.isoformat() if a.created_at else None,
                }
                for a, actor_name in rows
            ]
        }
