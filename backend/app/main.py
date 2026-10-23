import os, time
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, Column, Integer, String, DateTime, func, Index
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
from starlette.responses import Response

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+psycopg2://app:app@postgres:5432/app")
engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False)
Base = declarative_base()

class Task(Base):
    __tablename__ = "tasks"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False, index=True)
    status = Column(String(50), default="new")
    created_at = Column(DateTime, server_default=func.now())
    __table_args__ = (Index("ix_tasks_status_created", "status", "created_at"),)

Base.metadata.create_all(engine)

app = FastAPI(title="demo-fullstack-api")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

REQUESTS = Counter("demo_http_requests_total", "Total HTTP requests", ["method", "endpoint", "status_code"])
LATENCY = Histogram("demo_http_request_duration_seconds", "Request latency", ["endpoint"])

@app.middleware("http")
async def metrics_mw(request, call_next):
    start = time.time()
    response = await call_next(request)
    dur = time.time() - start
    REQUESTS.labels(request.method, request.url.path, str(response.status_code)).inc()
    LATENCY.labels(request.url.path).observe(dur)
    return response

@app.get("/metrics")
def metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

@app.get("/api/v1/health")
def health():
    return {"status": "ok"}

@app.get("/api/v1/tasks")
def list_tasks():
    db = SessionLocal()
    try:
        rows = db.query(Task).order_by(Task.created_at.desc()).limit(50).all()
        return [{"id": t.id, "title": t.title, "status": t.status} for t in rows]
    finally:
        db.close()

@app.post("/api/v1/tasks")
def create_task(payload: dict):
    db = SessionLocal()
    try:
        t = Task(title=payload.get("title", "no title"))
        db.add(t)
        db.commit()
        db.refresh(t)
        return {"id": t.id, "title": t.title, "status": t.status}
    finally:
        db.close()

@app.get("/api/v1/ai/audit")
def ai_audit():
    return {"audit": "placeholder", "recommendation": "add indexes and caching", "severity": "low"}
