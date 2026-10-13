"""Celery: background and scheduled tasks (worker + beat)."""

from datetime import date
from typing import Any

import httpx
from celery import Celery
from celery.schedules import crontab

from .api_client import ApiClient
from .config import get_settings
from .knowledge import index_knowledge
from .llm import chat_model, embedder
from .reports import generate, previous_month
from .store import Store, make_pool
from .watch import NPM_URL, USER_AGENT, llm_extractor, run_watch

settings = get_settings()
app = Celery("copilot", broker=settings.redis_url)
app.conf.update(
    task_ignore_result=True,  # outputs (reports, proposals) are written to Postgres
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    timezone=settings.timezone,
    broker_connection_retry_on_startup=True,
)


def _cron(expr: str) -> Any:
    minute, hour, day_of_month, month, day_of_week = expr.split()
    return crontab(
        minute=minute,
        hour=hour,
        day_of_month=day_of_month,
        month_of_year=month,
        day_of_week=day_of_week,
    )


app.conf.beat_schedule = {
    "index-knowledge-daily": {"task": "copilot.index_knowledge", "schedule": _cron("30 5 * * *")},
    # 1st of the month, 07:00: report of the previous month.
    "monthly-report": {"task": "copilot.monthly_report", "schedule": _cron("0 7 1 * *")},
    "rates-watch-weekly": {
        "task": "copilot.rates_watch",
        "schedule": _cron(settings.rates_watch_cron),
    },
}

_store: Store | None = None


def store() -> Store:
    global _store
    if _store is None:
        _store = Store(make_pool(settings.database_url))
    return _store


@app.task(name="copilot.index_knowledge")  # type: ignore[untyped-decorator]
def index_knowledge_task() -> int:
    if not settings.ai_enabled:
        return 0
    return index_knowledge(ApiClient(settings), store(), embedder(settings), date.today().year)


@app.task(name="copilot.monthly_report")  # type: ignore[untyped-decorator]
def monthly_report_task(period: str | None = None) -> int:
    model = chat_model(settings) if settings.ai_enabled else None
    return generate(ApiClient(settings), store(), period or previous_month(date.today()), model)


def _fetch(url: str) -> str:
    response = httpx.get(url, headers={"User-Agent": USER_AGENT}, timeout=30, follow_redirects=True)
    response.raise_for_status()
    return response.text


def _npm_latest() -> str:
    response = httpx.get(NPM_URL, timeout=15)
    response.raise_for_status()
    return str(response.json()["version"])


@app.task(name="copilot.rates_watch")  # type: ignore[untyped-decorator]
def rates_watch_task() -> int:
    s = store()
    run_id = s.start_run()
    ai = settings.ai_enabled
    summary = run_watch(
        ApiClient(settings),
        s,
        _fetch,
        date.today(),
        extractor=llm_extractor(chat_model(settings, fast=True)) if ai else None,
        embed=embedder(settings) if ai else None,
        npm_latest=_npm_latest,
    )
    s.finish_run(run_id, summary.as_dict())
    return run_id
