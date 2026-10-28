"""Тесты бэкенда (SQLite in-memory для локального запуска без Docker)."""

import os

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Force SQLite for tests before importing app settings
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"
os.environ["REDIS_URL"] = "redis://localhost:6379/0"
os.environ["ENVIRONMENT"] = "test"

from app.core.config import get_settings  # noqa: E402
from app.db.models import Base  # noqa: E402
from app.db.session import get_session  # noqa: E402
from app.main import app  # noqa: E402

settings = get_settings()


@pytest.fixture
async def test_engine():
    engine = create_async_engine(
        settings.database_url,
        echo=False,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.fixture
async def client(test_engine):
    async_session = sessionmaker(
        test_engine, class_=AsyncSession, expire_on_commit=False
    )

    async def override_get_session():
        async with async_session() as session:
            yield session

    app.dependency_overrides[get_session] = override_get_session
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_health(client):
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["database"] == "ok"


@pytest.mark.anyio
async def test_create_and_list_task(client):
    # Create
    response = await client.post(
        "/api/v1/tasks",
        json={"title": "Test task", "priority": "high"},
    )
    assert response.status_code == 201
    task = response.json()
    assert task["title"] == "Test task"
    assert task["priority"] == "high"
    assert task["status"] == "todo"

    # List
    response = await client.get("/api/v1/tasks?pageSize=10")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 1
    assert len(data["items"]) >= 1

    # Update status
    task_id = task["id"]
    response = await client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"status": "done"},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "done"

    # Delete
    response = await client.delete(f"/api/v1/tasks/{task_id}")
    assert response.status_code == 200
    assert response.json() == {"ok": True}

    # Confirm deleted
    response = await client.get("/api/v1/tasks?pageSize=10")
    assert response.status_code == 200
    data = response.json()
    assert not any(t["id"] == task_id for t in data["items"])
