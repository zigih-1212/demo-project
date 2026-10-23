"""Сервисный слой: кэш в Redis, пагинация, агрегаты."""

import json
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.models import Task

settings = get_settings()

PRIORITY_ORDER = case(
    {"critical": 4, "high": 3, "medium": 2, "low": 1},
    value=Task.priority,
)


class TaskService:
    def __init__(self, session: AsyncSession, redis) -> None:
        self.session = session
        self.redis = redis

    async def list_tasks(
        self,
        *,
        status: str | None = None,
        priority: str | None = None,
        search: str | None = None,
        sort: str = "created_at",
        order: str = "desc",
        page: int = 1,
        page_size: int = 20,
    ) -> dict:
        cache_key = f"tasks:list:{status}:{priority}:{search}:{sort}:{order}:{page}:{page_size}"

        cached = await self.redis.get(cache_key)
        if cached:
            payload = json.loads(cached)
            payload["cached"] = True
            return payload

        conditions = []
        if status:
            conditions.append(Task.status == status)
        if priority:
            conditions.append(Task.priority == priority)
        if search:
            pattern = f"%{search}%"
            conditions.append(Task.title.ilike(pattern))

        total_stmt = select(func.count()).select_from(Task)
        count_stmt = select(func.count()).select_from(Task)
        for condition in conditions:
            total_stmt = total_stmt.where(condition)
            count_stmt = count_stmt.where(condition)

        total = (await self.session.execute(total_stmt)).scalar_one()

        sort_column = {
            "created_at": Task.created_at,
            "title": Task.title,
            "priority": PRIORITY_ORDER,
        }.get(sort, Task.created_at)
        statement = select(Task)
        for condition in conditions:
            statement = statement.where(condition)
        statement = statement.order_by(
            sort_column.desc() if order == "desc" else sort_column.asc()
        )
        statement = statement.offset((page - 1) * page_size).limit(page_size)

        rows = (await self.session.execute(statement)).scalars().all()

        payload = {
            "items": [self._serialize(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
            "pages": max(1, -(-total // page_size)),
            "cached": False,
        }
        await self.redis.setex(
            cache_key, settings.cache_ttl_seconds, json.dumps(payload, default=str)
        )
        return payload

    async def get_task(self, task_id: uuid.UUID) -> Task | None:
        statement = select(Task).where(Task.id == task_id)
        return (await self.session.execute(statement)).scalar_one_or_none()

    async def create_task(self, payload: dict) -> Task:
        task = Task(
            title=payload["title"],
            description=payload.get("description", ""),
            priority=payload.get("priority", "medium"),
            assignee=payload.get("assignee", "unassigned"),
        )
        self.session.add(task)
        await self.session.commit()
        await self.session.refresh(task)
        await self._invalidate()
        return task

    async def update_task(self, task_id: uuid.UUID, payload: dict) -> Task | None:
        task = await self.get_task(task_id)
        if task is None:
            return None
        for field in ("title", "description", "status", "priority", "assignee"):
            if field in payload:
                setattr(task, field, payload[field])
        await self.session.commit()
        await self.session.refresh(task)
        await self._invalidate()
        return task

    async def delete_task(self, task_id: uuid.UUID) -> bool:
        task = await self.get_task(task_id)
        if task is None:
            return False
        await self.session.delete(task)
        await self.session.commit()
        await self._invalidate()
        return True

    async def summary(self, days: int = 14) -> dict:
        since = datetime.now(timezone.utc) - timedelta(days=days)

        by_status = (
            select(Task.status, func.count().label("count"))
            .group_by(Task.status)
        )
        by_priority = (
            select(Task.priority, func.count().label("count"))
            .group_by(Task.priority)
        )
        per_day = (
            select(
                func.date_trunc("day", Task.created_at).label("date"),
                func.count().label("count"),
            )
            .where(Task.created_at >= since)
            .group_by("date")
            .order_by("date")
        )
        total = select(func.count()).select_from(Task)

        status_rows = (await self.session.execute(by_status)).all()
        priority_rows = (await self.session.execute(by_priority)).all()
        day_rows = (await self.session.execute(per_day)).all()
        total_count = (await self.session.execute(total)).scalar_one()

        done = dict(status_rows).get("done", 0)
        return {
            "total": total_count,
            "by_status": dict(status_rows),
            "by_priority": dict(priority_rows),
            "created_per_day": [
                {"date": row.date.date().isoformat(), "count": row.count}
                for row in day_rows
            ],
            "completion_rate": round(done / total_count * 100, 1) if total_count else 0.0,
        }

    async def _invalidate(self) -> None:
        keys = [key async for key in self.redis.scan_iter(match="tasks:list:*")]
        if keys:
            await self.redis.delete(*keys)

    @staticmethod
    def _serialize(task: Task) -> dict:
        return {
            "id": str(task.id),
            "title": task.title,
            "description": task.description,
            "status": task.status,
            "priority": task.priority,
            "assignee": task.assignee,
            "created_at": task.created_at.isoformat() if task.created_at else None,
            "updated_at": task.updated_at.isoformat() if task.updated_at else None,
        }