from datetime import date

from langchain_core.messages import AIMessage, HumanMessage
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command

from copilot.graph import build_copilot
from copilot.tools import REFUSED, make_tools

from .conftest import FakeApi, ScriptedModel

TODAY = date(2026, 10, 13)


def tool_call(name: str, args: dict[str, object]) -> AIMessage:
    return AIMessage(content="", tool_calls=[{"name": name, "args": args, "id": "call_1"}])


def run(model: ScriptedModel, api: FakeApi, thread: str = "t1") -> tuple[object, dict[str, object]]:
    graph = build_copilot(model, make_tools(api.client(), 2026), InMemorySaver(), 2026, TODAY)
    return graph, {"configurable": {"thread_id": thread}}


def test_write_waits_for_approval_then_posts_cents() -> None:
    api = FakeApi({("POST", "/transactions"): {"id": 1}})
    model = ScriptedModel(
        script=[
            tool_call(
                "add_transaction",
                {
                    "date": "2026-10-10",
                    "label": "ACME",
                    "amount_ttc": 1234.56,
                    "kind": "encaissement",
                },
            ),
            AIMessage(content="C'est enregistré."),
        ]
    )
    graph, config = run(model, api)
    graph.invoke({"messages": [HumanMessage("ACME m'a payé 1234,56 € le 10/10")]}, config)  # type: ignore[attr-defined]

    snap = graph.get_state(config)  # type: ignore[attr-defined]
    assert snap.interrupts, "the write must pause for approval"
    assert "1\u202f234,56 € le 10/10/2026" in snap.interrupts[0].value["summary"]
    assert api.writes() == []

    graph.invoke(Command(resume={"approved": True}), config)  # type: ignore[attr-defined]
    assert api.writes() == [
        (
            "POST",
            "/transactions",
            {
                "date": "2026-10-10",
                "label": "ACME",
                "amount": 123456,
                "kind": "encaissement",
                "vatAmount": 0,
                "invoiceId": None,
                "deadlineId": None,
            },
        )
    ]
    final = graph.get_state(config).values["messages"][-1]  # type: ignore[attr-defined]
    assert final.content == "C'est enregistré."


def test_refusal_writes_nothing() -> None:
    api = FakeApi({})
    model = ScriptedModel(
        script=[
            tool_call("pay_deadline", {"deadline_id": 3, "date": "2026-10-13"}),
            AIMessage(content="D'accord, je n'y touche pas."),
        ]
    )
    graph, config = run(model, api)
    graph.invoke({"messages": [HumanMessage("paie l'échéance 3")]}, config)  # type: ignore[attr-defined]
    graph.invoke(Command(resume={"approved": False}), config)  # type: ignore[attr-defined]
    assert api.writes() == []
    tool_result = graph.get_state(config).values["messages"][-2]  # type: ignore[attr-defined]
    assert tool_result.content == REFUSED


def test_frais_pro_is_stored_as_an_outflow() -> None:
    api = FakeApi({})
    model = ScriptedModel(
        script=[
            tool_call(
                "add_transaction",
                {
                    "date": "2026-10-01",
                    "label": "Logiciel",
                    "amount_ttc": 60,
                    "kind": "frais_pro",
                    "vat": 10,
                },
            ),
            AIMessage(content="ok"),
        ]
    )
    graph, config = run(model, api)
    graph.invoke({"messages": [HumanMessage("x")]}, config)  # type: ignore[attr-defined]
    graph.invoke(Command(resume={"approved": True}), config)  # type: ignore[attr-defined]
    body = api.writes()[0][2]
    assert body["amount"] == -6000
    assert body["vatAmount"] == 1000


def test_simulate_tool_uses_the_engine_and_converts_to_euros() -> None:
    breakdown = {
        "statut": "micro_bnc",
        "ca": 10800000,
        "fraisPro": 180000,
        "cotisations": 2764800,
        "cfp": 21600,
        "impot": 1448800,
        "net": 6384800,
        "warnings": [],
    }
    api = FakeApi({("POST", "/simulate"): [breakdown]})
    tools = {t.name: t for t in make_tools(api.client(), 2026)}
    result = tools["simulate"].invoke({"tjm": 500, "jours_par_mois": 18, "frais_mensuels": 150})
    assert result[0]["net"] == 63848.0
    assert api.calls[0] == (
        "POST",
        "/simulate",
        {"year": 2026, "tjm": 500, "joursParMois": 18, "fraisMensuels": 150, "settings": {}},
    )


def test_change_settings_merges_into_the_timeline() -> None:
    timeline = [
        {"validFrom": "2026-01-01", "settings": {"statut": "micro_bnc", "tva": "franchise"}}
    ]
    api = FakeApi({("GET", "/settings"): timeline, ("PUT", "/settings"): timeline})
    model = ScriptedModel(
        script=[
            tool_call(
                "change_settings", {"valid_from": "2026-11-01", "changes": {"tva": "assujetti"}}
            ),
            AIMessage(content="ok"),
        ]
    )
    graph, config = run(model, api)
    graph.invoke({"messages": [HumanMessage("je passe à la TVA en novembre")]}, config)  # type: ignore[attr-defined]
    graph.invoke(Command(resume={"approved": True}), config)  # type: ignore[attr-defined]
    put = next(c for c in api.calls if c[0] == "PUT")
    assert put[2][-1] == {"validFrom": "2026-11-01", "settings": {"tva": "assujetti"}}
