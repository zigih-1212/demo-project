"""FastAPI-приложение: REST API, метрики, health-checks."""

import logging
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import redis.asyncio as aioredis
from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.session import engine, get_session
from app.services.activity_service import ActivityService
from app.services.auth_service import AuthService
from app.services.task_service import TaskService

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("demo")
settings = get_settings()

REQUESTS = Counter(
    "http_requests_total", "Total HTTP requests", ["method", "path", "status"]
)
LATENCY = Histogram(
    "http_request_duration_seconds", "HTTP request latency", ["method", "path"]
)

redis_client: aioredis.Redis | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global redis_client
    redis_client = aioredis.from_url(settings.redis_url, encoding="utf-8")
    async with engine.begin() as connection:
        await connection.execute(text("SELECT 1"))
    logger.info("startup complete, environment=%s", settings.environment)
    yield
    await redis_client.aclose()
    await engine.dispose()


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


@app.middleware("http")
async def metrics_middleware(request: Request, call_next):
    request_id = request.headers.get("x-request-id", str(uuid.uuid4()))
    started = time.perf_counter()
    response = await call_next(request)
    duration = time.perf_counter() - started
    path = request.url.path
    REQUESTS.labels(request.method, path, str(response.status_code)).inc()
    LATENCY.labels(request.method, path).observe(duration)
    response.headers["x-request-id"] = request_id
    logger.info(
        "request",
        extra={
            "request_id": request_id,
            "method": request.method,
            "path": path,
            "status": response.status_code,
            "duration_ms": round(duration * 1000, 2),
        },
    )
    return response


def get_service(session: AsyncSession = Depends(get_session)) -> TaskService:
    return TaskService(session, redis_client)


def get_auth_service(session: AsyncSession = Depends(get_session)) -> AuthService:
    return AuthService(session, redis_client, settings.jwt_secret_key)


def get_activity_service(
    session: AsyncSession = Depends(get_session),
) -> ActivityService:
    return ActivityService(session, redis_client)


@app.get("/health")
async def health(session: AsyncSession = Depends(get_session)) -> dict:
    await session.execute(text("SELECT 1"))
    return {
        "status": "ok",
        "database": "ok",
        "redis": "ok" if redis_client else "missing",
        "environment": settings.environment,
        "ts": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/metrics")
async def metrics() -> Response:
    if not settings.prometheus_enabled:
        raise HTTPException(status_code=404)
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


# ===== AUTH =====


@app.post("/api/v1/auth/register")
async def register(
    payload: dict,
    service: AuthService = Depends(get_auth_service),
) -> dict:
    email = str(payload.get("email", "")).strip().lower()
    password = str(payload.get("password", ""))
    name = str(payload.get("name", "")).strip() or email
    role = str(payload.get("role", "member"))
    team = str(payload.get("team", "platform"))
    return await service.register(email, password, name, role, team)


@app.post("/api/v1/auth/login")
async def login(
    payload: dict,
    service: AuthService = Depends(get_auth_service),
) -> dict:
    email = str(payload.get("email", "")).strip().lower()
    password = str(payload.get("password", ""))
    return await service.login(email, password)


@app.get("/api/v1/auth/me")
async def me(
    service: AuthService = Depends(get_auth_service),
    request: Request = None,
) -> dict:
    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="missing token")
    token = auth_header.split(" ", 1)[1]
    return await service.get_current_user(token)


@app.get("/api/v1/auth/users")
async def list_users(
    service: AuthService = Depends(get_auth_service),
) -> dict:
    return await service.list_users()


# ===== TASKS =====


@app.get("/api/v1/tasks")
async def list_tasks(
    service: TaskService = Depends(get_service),
    status: str | None = Query(default=None),
    priority: str | None = Query(default=None),
    assignee: str | None = Query(default=None),
    search: str | None = Query(default=None),
    sort: str = Query(default="created_at"),
    order: str = Query(default="desc"),
    page: int = Query(default=1, ge=1, le=1000),
    page_size: int = Query(default=20, ge=1, le=100),
) -> dict:
    if status and status not in {"todo", "in_progress", "done", "blocked"}:
        raise HTTPException(status_code=400, detail="invalid status")
    return await service.list_tasks(
        status=status,
        priority=priority,
        assignee=assignee,
        search=search,
        sort=sort,
        order=order,
        page=page,
        page_size=page_size,
    )


@app.post("/api/v1/tasks", status_code=201)
async def create_task(
    payload: dict,
    service: TaskService = Depends(get_service),
    activity: ActivityService = Depends(get_activity_service),
) -> dict:
    title = str(payload.get("title", "")).strip()
    if len(title) < 3:
        raise HTTPException(
            status_code=400, detail="title must be at least 3 characters"
        )
    created_by = payload.get("created_by")
    task = await service.create_task(
        {
            "title": title,
            "description": payload.get("description", ""),
            "priority": payload.get("priority", "medium"),
            "assignee": payload.get("assignee", "unassigned"),
            "created_by": created_by,
            "due_date": payload.get("due_date"),
        }
    )
    await activity.record(
        task_id=task.id,
        action="create",
        summary=f"Создана задача «{task.title}»",
    )
    # Celery reindex is fire-and-forget; enabled when Redis worker is running
    return service._serialize(task)


@app.patch("/api/v1/tasks/{task_id}")
async def update_task(
    task_id: uuid.UUID,
    payload: dict,
    service: TaskService = Depends(get_service),
    activity: ActivityService = Depends(get_activity_service),
) -> dict:
    task = await service.update_task(task_id, payload)
    if task is None:
        raise HTTPException(status_code=404, detail="task not found")
    await activity.record(
        task_id=task.id,
        action="update",
        summary=f"Обновлена задача «{task.title}»",
    )
    return service._serialize(task)


@app.delete("/api/v1/tasks/{task_id}")
async def delete_task(
    task_id: uuid.UUID,
    service: TaskService = Depends(get_service),
) -> dict:
    if not await service.delete_task(task_id):
        raise HTTPException(status_code=404, detail="task not found")
    return {"ok": True}


@app.get("/api/v1/analytics/summary")
async def summary(service: TaskService = Depends(get_service)) -> dict:
    return await service.summary()


# ===== ACTIVITY =====


@app.get("/api/v1/activity")
async def activity_list(
    service: ActivityService = Depends(get_activity_service),
    limit: int = Query(default=50, ge=1, le=200),
) -> dict:
    return await service.recent(limit=limit)


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("unhandled error", extra={"path": request.url.path})
    return JSONResponse(
        status_code=500,
        content={
            "error": {"code": "internal_error", "message": "Internal server error"}
        },
    )
