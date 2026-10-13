"""HTTP service used by the web app: chat with approvals, reports, rates watch."""

import uuid
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import date
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Request
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, ToolMessage
from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.types import Command
from pydantic import BaseModel, Field

from .api_client import ApiClient
from .config import Settings
from .graph import build_copilot
from .llm import AiDisabledError, Embedder
from .store import Store
from .tools import make_tools


@dataclass
class Deps:
    settings: Settings
    api: ApiClient
    store: Store | None
    checkpointer: BaseCheckpointSaver[Any]
    model: Callable[[], BaseChatModel]
    embed: Callable[[], Embedder] | None
    enqueue: Callable[[str, dict[str, Any]], str]
    today: Callable[[], date] = date.today


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    thread_id: str | None = Field(default=None, max_length=64)


class ResumeIn(BaseModel):
    approved: bool


class ReportIn(BaseModel):
    period: str | None = Field(default=None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$")


def _text(message: BaseMessage) -> str:
    return str(message.text)


def render(messages: list[BaseMessage]) -> list[dict[str, Any]]:
    """User and assistant turns; tool calls are folded into the assistant turn as steps."""
    out: list[dict[str, Any]] = []
    steps: list[str] = []
    for m in messages:
        if isinstance(m, HumanMessage):
            out.append({"role": "user", "content": _text(m)})
            steps = []
        elif isinstance(m, AIMessage):
            steps += [c["name"] for c in m.tool_calls]
            content = _text(m)
            if content.strip():
                out.append({"role": "assistant", "content": content, "steps": steps})
                steps = []
        elif isinstance(m, ToolMessage):
            continue
    return out


def create_app(deps_factory: Callable[[], Deps], verify: Callable[[Request], str]) -> FastAPI:
    """`verify` checks the Cloudflare Access JWT (see auth.make_verifier)."""
    state: dict[str, Deps] = {}

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        state["deps"] = deps_factory()
        yield

    app = FastAPI(title="Finance Cockpit agents", lifespan=lifespan, docs_url=None, redoc_url=None)
    auth = verify

    def deps() -> Deps:
        return state["deps"]

    def graph_for(d: Deps, thread_id: str) -> Any:
        year = d.today().year
        try:
            model = d.model()
            embed = d.embed() if d.embed is not None else None
        except AiDisabledError as e:
            raise HTTPException(status_code=503, detail=str(e)) from e
        tools = make_tools(d.api, year, d.store, embed, thread_id)
        return build_copilot(model, tools, d.checkpointer, year, d.today())

    def snapshot(graph: Any, thread_id: str) -> dict[str, Any]:
        config: RunnableConfig = {"configurable": {"thread_id": thread_id}}
        snap = graph.get_state(config)
        messages = snap.values.get("messages", []) if snap.values else []
        pending = [i.value for i in snap.interrupts]
        return {
            "thread_id": thread_id,
            "messages": render(messages),
            "pending": pending[0] if pending else None,
        }

    @app.get("/agent/health")
    def health(d: Deps = Depends(deps)) -> dict[str, Any]:  # noqa: B008
        return {"status": "ok", "ai_enabled": d.settings.ai_enabled}

    @app.post("/agent/chat", dependencies=[Depends(auth)])
    def chat(body: ChatIn, d: Deps = Depends(deps)) -> dict[str, Any]:  # noqa: B008
        thread_id = body.thread_id or uuid.uuid4().hex
        graph = graph_for(d, thread_id)
        config: RunnableConfig = {"configurable": {"thread_id": thread_id}, "recursion_limit": 25}
        if snapshot(graph, thread_id)["pending"] is not None:
            raise HTTPException(status_code=409, detail="Une action attend ta validation.")
        graph.invoke({"messages": [HumanMessage(body.message)]}, config)
        return snapshot(graph, thread_id)

    @app.post("/agent/chat/{thread_id}/resume", dependencies=[Depends(auth)])
    def resume(thread_id: str, body: ResumeIn, d: Deps = Depends(deps)) -> dict[str, Any]:  # noqa: B008
        graph = graph_for(d, thread_id)
        if snapshot(graph, thread_id)["pending"] is None:
            raise HTTPException(status_code=409, detail="Aucune action en attente.")
        config: RunnableConfig = {"configurable": {"thread_id": thread_id}, "recursion_limit": 25}
        graph.invoke(Command(resume={"approved": body.approved}), config)
        return snapshot(graph, thread_id)

    @app.get("/agent/chat/{thread_id}", dependencies=[Depends(auth)])
    def history(thread_id: str, d: Deps = Depends(deps)) -> dict[str, Any]:  # noqa: B008
        return snapshot(graph_for(d, thread_id), thread_id)

    @app.get("/agent/reports", dependencies=[Depends(auth)])
    def reports(d: Deps = Depends(deps)) -> list[dict[str, Any]]:  # noqa: B008
        return d.store.list_reports() if d.store is not None else []

    @app.get("/agent/reports/{report_id}", dependencies=[Depends(auth)])
    def report(report_id: int, d: Deps = Depends(deps)) -> dict[str, Any]:  # noqa: B008
        found = d.store.get_report(report_id) if d.store is not None else None
        if found is None:
            raise HTTPException(status_code=404, detail="Rapport introuvable.")
        return found

    @app.post("/agent/reports", dependencies=[Depends(auth)])
    def new_report(body: ReportIn, d: Deps = Depends(deps)) -> dict[str, str]:  # noqa: B008
        return {"task_id": d.enqueue("copilot.monthly_report", {"period": body.period})}

    @app.post("/agent/rates-watch", dependencies=[Depends(auth)])
    def start_watch(d: Deps = Depends(deps)) -> dict[str, str]:  # noqa: B008
        return {"task_id": d.enqueue("copilot.rates_watch", {})}

    @app.get("/agent/rates-watch", dependencies=[Depends(auth)])
    def watch_state(d: Deps = Depends(deps)) -> dict[str, Any]:  # noqa: B008
        if d.store is None:
            return {"runs": [], "sources": []}
        return {"runs": d.store.list_runs(), "sources": d.store.list_source_checks()}

    @app.get("/agent/proposals", dependencies=[Depends(auth)])
    def proposals(
        kind: str | None = None,
        status: str | None = None,
        d: Deps = Depends(deps),  # noqa: B008
    ) -> list[dict[str, Any]]:
        if d.store is None:
            return []
        rows = d.store.list_proposals(kind=kind, status=status)
        # Chat write actions are an audit log, not something to review here.
        return [r for r in rows if r["kind"] != "write_action"] if kind is None else rows

    @app.post("/agent/proposals/{proposal_id}/decision", dependencies=[Depends(auth)])
    def decide(proposal_id: int, body: ResumeIn, d: Deps = Depends(deps)) -> dict[str, Any]:  # noqa: B008
        found = d.store.get_proposal(proposal_id) if d.store is not None else None
        if found is None or d.store is None:
            raise HTTPException(status_code=404, detail="Proposition introuvable.")
        if found["status"] != "pending":
            raise HTTPException(status_code=409, detail="Déjà traitée.")
        if found["kind"] == "write_action":
            raise HTTPException(status_code=400, detail="Les écritures se valident dans le chat.")
        d.store.decide_proposal(proposal_id, "approved" if body.approved else "rejected")
        return {**found, "status": "approved" if body.approved else "rejected"}

    @app.post("/agent/knowledge/reindex", dependencies=[Depends(auth)])
    def reindex(d: Deps = Depends(deps)) -> dict[str, str]:  # noqa: B008
        return {"task_id": d.enqueue("copilot.index_knowledge", {})}

    return app
