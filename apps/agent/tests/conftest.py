import json
from collections.abc import Callable, Iterator, Sequence
from typing import Any

import httpx
import pytest
from langchain_core.callbacks import CallbackManagerForLLMRun
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from langchain_core.runnables import Runnable
from pydantic import Field

from copilot.api_client import ApiClient
from copilot.config import Settings


class ScriptedModel(BaseChatModel):
    """Returns the scripted AI messages in order (tool calls included)."""

    script: list[AIMessage]
    seen: list[list[BaseMessage]] = Field(default_factory=list)

    @property
    def _llm_type(self) -> str:
        return "scripted"

    def _generate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: CallbackManagerForLLMRun | None = None,
        **kwargs: Any,
    ) -> ChatResult:
        self.seen.append(messages)
        return ChatResult(generations=[ChatGeneration(message=self.script.pop(0))])

    def bind_tools(self, tools: Sequence[Any], **kwargs: Any) -> Runnable[Any, BaseMessage]:
        return self


def settings(**overrides: Any) -> Settings:
    env = {
        "AGENT_DATABASE_URL": "postgresql://x:y@localhost/z",
        "AGENT_API_TOKEN": "t" * 40,
        "AUTH_MODE": "none",
        "API_URL": "http://api.test/api",
        **overrides,
    }
    return Settings(**env)


class FakeApi:
    """Records requests; answers from a route table."""

    def __init__(self, routes: dict[tuple[str, str], Any]) -> None:
        self.routes = routes
        self.calls: list[tuple[str, str, Any]] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content) if request.content else None
        path = request.url.path.removeprefix("/api")
        self.calls.append((request.method, path, body))
        assert request.headers["Authorization"] == "Bearer " + "t" * 40
        answer = self.routes.get((request.method, path), {})
        if callable(answer):
            answer = answer(body)
        return httpx.Response(200, json=answer)

    def client(self) -> ApiClient:
        return ApiClient(settings(), transport=httpx.MockTransport(self.handler))

    def writes(self) -> list[tuple[str, str, Any]]:
        return [c for c in self.calls if c[0] != "GET"]


@pytest.fixture
def fake_api() -> Callable[[dict[tuple[str, str], Any]], FakeApi]:
    return FakeApi


@pytest.fixture
def anyio_backend() -> Iterator[str]:
    yield "asyncio"
