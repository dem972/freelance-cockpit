from datetime import date
from typing import Any

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage
from langgraph.checkpoint.memory import InMemorySaver

from copilot.auth import make_verifier
from copilot.llm import AiDisabledError
from copilot.server import Deps, create_app

from .conftest import FakeApi, ScriptedModel, settings


def make_client(script: list[AIMessage], api: FakeApi, ai: bool = True) -> TestClient:
    model = ScriptedModel(script=script)
    saver = InMemorySaver()

    def model_factory() -> ScriptedModel:
        if not ai:
            raise AiDisabledError()
        return model

    deps = Deps(
        settings=settings(),
        api=api.client(),
        store=None,
        checkpointer=saver,
        model=model_factory,
        embed=None,
        enqueue=lambda task, kwargs: "task-1",
        today=lambda: date(2026, 10, 13),
    )
    app = create_app(lambda: deps, make_verifier(settings()))
    return TestClient(app)


def test_chat_pause_and_resume() -> None:
    api = FakeApi({("POST", "/invoices/7/pay"): {"id": 9}})
    script = [
        AIMessage(
            content="",
            tool_calls=[
                {
                    "name": "mark_invoice_paid",
                    "args": {"invoice_id": 7, "date": "2026-10-12"},
                    "id": "c1",
                }
            ],
        ),
        AIMessage(content="Facture encaissée."),
    ]
    with make_client(script, api) as client:
        first = client.post("/agent/chat", json={"message": "la facture 7 est payée d'hier"}).json()
        assert first["pending"]["action"] == "mark_invoice_paid"
        assert api.writes() == []
        thread = first["thread_id"]

        blocked = client.post("/agent/chat", json={"message": "autre chose", "thread_id": thread})
        assert blocked.status_code == 409

        done = client.post(f"/agent/chat/{thread}/resume", json={"approved": True}).json()
        assert done["pending"] is None
        assert done["messages"][-1] == {
            "role": "assistant",
            "content": "Facture encaissée.",
            "steps": ["mark_invoice_paid"],
        }
        assert api.writes() == [("POST", "/invoices/7/pay", {"date": "2026-10-12"})]

        history = client.get(f"/agent/chat/{thread}").json()
        assert [m["role"] for m in history["messages"]] == ["user", "assistant"]


def test_ai_disabled_is_a_clear_503() -> None:
    with make_client([], FakeApi({}), ai=False) as client:
        res = client.post("/agent/chat", json={"message": "bonjour"})
        assert res.status_code == 503
        assert "OPENAI_API_KEY" in res.json()["detail"]
        assert client.get("/agent/health").json()["status"] == "ok"


@pytest.fixture(scope="module")
def keys() -> tuple[Any, Any]:
    good = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    return good, other


def test_access_jwt(keys: tuple[Any, Any]) -> None:
    good, other = keys
    s = settings(
        AUTH_MODE="access",
        CF_ACCESS_TEAM_DOMAIN="team.cloudflareaccess.com",
        CF_ACCESS_AUD="aud",
        ALLOWED_EMAILS="me@example.com",
    )
    verify = make_verifier(s, get_key=lambda _token: good.public_key())

    class Req:
        def __init__(self, token: str) -> None:
            self.headers = {"Cf-Access-Jwt-Assertion": token} if token else {}

    def token(email: str, key: Any = good, aud: str = "aud") -> str:
        return jwt.encode(
            {
                "email": email,
                "aud": aud,
                "iss": "https://team.cloudflareaccess.com",
                "exp": 4102444800,
            },
            key,
            algorithm="RS256",
        )

    assert verify(Req(token("Me@Example.com"))) == "me@example.com"  # type: ignore[arg-type]
    for bad, status in [
        ("", 401),
        (token("me@example.com", other), 401),
        (token("me@example.com", aud="x"), 401),
        (token("x@example.com"), 403),
    ]:
        with pytest.raises(Exception) as err:
            verify(Req(bad))  # type: ignore[arg-type]
        assert getattr(err.value, "status_code", None) == status


def test_report_endpoints_validate_and_enqueue() -> None:
    with make_client([], FakeApi({})) as client:
        assert client.get("/agent/reports").json() == []
        assert client.post("/agent/reports", json={"period": "2026-09"}).json() == {
            "task_id": "task-1"
        }
        assert client.post("/agent/reports", json={"period": "2026-13"}).status_code == 422
        assert client.get("/agent/reports/1").status_code == 404
