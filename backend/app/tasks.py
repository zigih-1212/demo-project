"""Точка входа для обнаружения задач Celery."""

from app.celery_app import (  # noqa: F401
    celery_app,
    export_tasks,
    reindex_task,
    run_audit,
)
