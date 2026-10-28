"""Celery-приложение: фоновые задачи (аналог Cloudflare Queues)."""

import logging

from celery import Celery
from celery.schedules import crontab

from app.core.config import get_settings

settings = get_settings()

celery_app = Celery(
    "demo_fullstack",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=["app.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=300,
    task_soft_time_limit=240,
    worker_max_tasks_per_child=1000,
    broker_connection_retry_on_startup=False,
    broker_connection_retry=False,
    broker_connection_timeout=2,
    beat_schedule={
        "hourly-audit": {
            "task": "app.tasks.run_audit",
            "schedule": crontab(minute=0),
        },
        "daily-digest": {
            "task": "app.tasks.export_tasks",
            "schedule": crontab(hour=7, minute=30),
        },
    },
)


@celery_app.task(name="app.tasks.reindex_task", bind=True, max_retries=3)
def reindex_task(self, task_id: str) -> dict:
    """Переиндексация задачи после записи."""
    logging.info("reindex task %s", task_id)
    return {"task_id": task_id, "status": "reindexed"}


@celery_app.task(name="app.tasks.export_tasks", bind=True, max_retries=3)
def export_tasks(self) -> dict:
    """Выгрузка задач в объектное хранилище."""
    logging.info("export tasks")
    return {"status": "exported"}


@celery_app.task(name="app.tasks.run_audit", bind=True, max_retries=3)
def run_audit(self) -> dict:
    """Регулярный аудит качества данных."""
    logging.info("audit run")
    return {"status": "audited"}
