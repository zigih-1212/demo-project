"""Конфигурация приложения через переменные окружения."""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "demo-fullstack-api"
    environment: str = "development"
    log_level: str = "INFO"

    database_url: str = Field(
        default="postgresql+asyncpg://app:app@postgres:5432/app",
    )
    redis_url: str = "redis://redis:6379/0"

    cache_ttl_seconds: int = 60
    rate_limit_per_minute: int = 120

    prometheus_enabled: bool = True
    log_json: bool = True

    celery_broker_url: str = ""
    celery_result_backend: str = ""


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    if not settings.celery_broker_url:
        settings.celery_broker_url = settings.redis_url
    if not settings.celery_result_backend:
        settings.celery_result_backend = settings.redis_url
    return settings