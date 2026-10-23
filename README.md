# TaskBoard — демо-проект уровня Middle

Демо-проект к вакансии **Fullstack Developer (Middle)** в ASTON.

**Живая версия:** фронтенд — <https://master.demo-fullstack-frontend.pages.dev>,
API — <https://demo-fullstack-backend.dvybornyh332.workers.dev>

Это не статическая заготовка: фронтенд работает с реальным API, данные лежат в
реляционной базе, есть кэш, очереди, метрики и автотесты.

---

## Что можно потыкать прямо сейчас

| Что | Где |
|---|---|
| Дашборд: KPI, график постановки задач, распределение по приоритету | главная страница |
| CRUD задач: создание, фильтры, поиск, сортировка, пагинация, смена статуса, удаление | блок «Задачи» |
| **Аудит ИИ-агента** с находками и планом рефакторинга | блок «Аудит ИИ-агента» → «Запустить» |
| Метрики Prometheus в реальном времени | блок «Метрики Prometheus» |
| REST API | `/docs` у любого из сервисов |

## Соответствие требованиям вакансии

| Требование | Как реализовано |
|---|---|
| Python, Full-stack 3+ лет | `backend/` — FastAPI 3.12, async SQLAlchemy 2.0, Celery; фронтенд — SPA |
| Проектирование архитектуры, выбор БД | PostgreSQL 16 + Redis; решения зафиксированы в [ARCHITECTURE.md](ARCHITECTURE.md) (ADR-001…007) |
| Брокеры сообщений | Celery + Redis broker, Beat; в edge-варианте — Cloudflare Queues |
| Стратегии кэширования | read-through кэш (Redis / KV), инвалидация по записи, TTL 60 с |
| Оптимизация запросов и производительность | индексы под фильтры, пагинация, агрегаты в БД, кэш, гистограмма латентности |
| CI/CD | GitHub Actions: typecheck → unit-тесты → lint → сборка образа → CodeQL → deploy со smoke-тестом |
| Мониторинг и логи (Grafana, Prometheus) | `/metrics` в формате Prometheus, дашборд Grafana, правила алертов SLO |
| Docker | multi-stage Dockerfile, non-root, healthcheck, `docker-compose.yml` на 8 сервисов |
| Kubernetes | Deployment (probes, resources, securityContext), Service, HPA, PDB, Ingress, отдельный worker |
| Celery / Airflow | Celery worker + Beat (расписание: переиндексация, выгрузка, ежечасный аудит) |
| PostgreSQL | asyncpg + SQLAlchemy, Alembic-совместимая схема, CHECK-констрейнты, 3 индекса |
| Аудит ИИ-агента и план рефакторинга | `AuditService`: проверка схемы/индексов/качества данных, оценка и план с приоритетами |
| NiFi | не реализовано осознанно — в демо нет внешнего data-flow, к которому подключалась бы NiFi |

## Структура

```
demo-project/
├── worker/                   # TypeScript backend на Cloudflare Workers (живое демо)
│   ├── src/
│   │   ├── index.ts          # точка входа, роутинг, обработчик очереди
│   │   ├── routes/           # HTTP-слой (tasks, analytics)
│   │   ├── services/         # бизнес-логика (task, analytics, audit)
│   │   ├── repositories/     # доступ к данным (SQL)
│   │   ├── middleware/       # request id, логирование, ошибки, rate limit
│   │   ├── lib/              # кэш, метрики, логи, валидация, ошибки
│   │   └── db/               # схема и сид
│   ├── migrations/           # миграции D1
│   └── tests/                # 19 unit-тестов (vitest)
├── backend/                  # Python backend (FastAPI + PostgreSQL + Celery) — эталон
│   └── app/{core,db,services}
├── frontend/dist/            # статика для Cloudflare Pages
├── infra/
│   ├── prometheus/           # конфиг + правила алертов SLO
│   └── grafana/              # provisioning + дашборд SLO
├── k8s/                      # манифесты Kubernetes
├── .github/workflows/        # ci.yml, cd.yml, codeql.yml
├── docker-compose.yml
└── ARCHITECTURE.md           # инженерные решения
```

## Локальный запуск (полный стек)

```bash
cp .env.example .env
docker compose up --build
```

| Сервис | URL |
|---|---|
| API (FastAPI) | <http://localhost:8000>, документация `/docs` |
| Prometheus | <http://localhost:9090> |
| Grafana | <http://localhost:3001> (admin/admin), дашборд «Demo Fullstack API — SLO» |

## Локальный запуск (только backend на Cloudflare)

```bash
cd worker
npm install
npm run dev          # http://localhost:8787
npx wrangler d1 migrations apply demo-fullstack-db --local
npx wrangler d1 execute demo-fullstack-db --file=src/db/seed.sql --local
```

## Тесты и статический анализ

```bash
cd worker
npm run typecheck
npm run test

cd ../backend
ruff check app
pytest -q
```

## Деплой

Токены передаются только через секреты CI:

```
CLOUDFLARE_API_TOKEN  — GitHub Actions secret
CLOUDFLARE_ACCOUNT_ID — GitHub Actions secret
```

`cd.yml` применяет миграции D1, деплоит Worker и Pages, затем прогоняет smoke-тест
(`/health` и выборка задач). Токены в репозитории не хранятся — `.env` в `.gitignore`.

## Почему стек в живом демо отличается от описанного в вакансии

Вакансия описывает классический стек (Python, PostgreSQL, Celery, K8s). Для публичного
демо нужен запуск без единой VM, поэтому **живая версия** — это Cloudflare Workers +
D1 + KV + Queues: тот же контракт API, та же слоистая архитектура, тот же формат
метрик. **Эталонная версия** (Python/PostgreSQL/Celery/K8s) лежит в `backend/` и
поднимается через `docker compose`.

Причина такого решения и её альтернативы разобраны в [ARCHITECTURE.md](ARCHITECTURE.md).