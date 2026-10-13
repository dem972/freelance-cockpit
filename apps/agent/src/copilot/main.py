"""Entry point of the HTTP service: `uvicorn copilot.main:app`."""

from langgraph.checkpoint.postgres import PostgresSaver
from psycopg_pool import ConnectionPool

from .api_client import ApiClient
from .auth import make_verifier
from .config import get_settings
from .llm import chat_model, embedder
from .server import Deps, create_app
from .store import Store, make_pool


def _deps() -> Deps:
    settings = get_settings()
    pool = make_pool(settings.database_url)
    checkpointer = PostgresSaver(pool)
    checkpointer.setup()

    def enqueue(task: str, kwargs: dict[str, object]) -> str:
        from .tasks import app as celery

        return str(celery.send_task(task, kwargs=kwargs).id)

    return Deps(
        settings=settings,
        api=ApiClient(settings),
        store=Store(pool),
        checkpointer=checkpointer,
        model=lambda: chat_model(settings),
        embed=lambda: embedder(settings),
        enqueue=enqueue,
    )


app = create_app(_deps, make_verifier(get_settings()))
__all__ = ["ConnectionPool", "app"]
