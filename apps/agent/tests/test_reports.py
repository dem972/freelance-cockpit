from datetime import date
from typing import Any

from langchain_core.messages import AIMessage

from copilot.reports import collect, generate, previous_month, template

from .conftest import FakeApi, ScriptedModel

NNBSP = "\u202f"  # French thousands separator


def bd(net: int, ca: int = 1_000_000) -> dict[str, Any]:
    return {
        "statut": "micro_bnc",
        "ca": ca,
        "fraisPro": 0,
        "cotisations": 256_000,
        "cfp": 2_000,
        "impot": 50_000,
        "net": net,
        "warnings": [],
    }


COCKPIT = {
    "asOf": "2026-10-13",
    "balance": {"balance": 2_000_000, "provisionsUnpaid": 300_000, "available": 1_700_000},
    "coverage": {"ratio": 6.6, "next": None},
    "realised": bd(600_000),
    "projected": bd(4_500_000, 7_000_000),
    "plan": {**bd(5_000_000), "months": [{"month": m, "ca": 800_000} for m in range(1, 13)]},
    "deadlines": [
        {
            "id": 1,
            "label": "Urssaf : septembre 2026",
            "dueOn": "2026-10-31",
            "amountDue": 129_000,
            "paidOn": None,
        },
        {
            "id": 2,
            "label": "Urssaf : août 2026",
            "dueOn": "2026-09-30",
            "amountDue": 0,
            "paidOn": None,
        },
    ],
}
TXS = [
    {
        "date": "2026-09-05",
        "kind": "encaissement",
        "amount": 500_000,
        "vatAmount": 0,
        "provisions": [],
    },
    {
        "date": "2026-09-08",
        "kind": "frais_pro",
        "amount": -12_000,
        "vatAmount": 2_000,
        "provisions": [],
    },
    {
        "date": "2026-08-05",
        "kind": "encaissement",
        "amount": 999_900,
        "vatAmount": 0,
        "provisions": [],
    },
]
OPTIM = {
    "baseline": {"title": "Situation actuelle (Micro-entreprise (BNC))", "net": 4_500_000},
    "options": [{"title": "EURL à l'IR", "net": 4_000_000, "gain": -500_000}],
    "disclaimer": "Ce n'est pas un conseil.",
}
ALERTS = [{"severity": "warning", "title": "Urssaf dans 18 j", "message": "1 290 € à payer."}]


def api() -> FakeApi:
    return FakeApi(
        {
            ("GET", "/cockpit"): COCKPIT,
            ("GET", "/transactions"): TXS,
            ("GET", "/optimize"): OPTIM,
            ("GET", "/alerts"): ALERTS,
        }
    )


class FakeStore:
    def __init__(self) -> None:
        self.saved: list[tuple[str, str, str, dict[str, Any]]] = []

    def insert_report(self, period: str, title: str, markdown: str, data: dict[str, Any]) -> int:
        self.saved.append((period, title, markdown, data))
        return len(self.saved)


def test_previous_month() -> None:
    assert previous_month(date(2026, 10, 1)) == "2026-09"
    assert previous_month(date(2027, 1, 1)) == "2026-12"


def test_collect_only_the_month_and_in_euros() -> None:
    data = collect(api().client(), "2026-09")
    assert data["mois"]["encaissements"] == 5000.0
    assert data["mois"]["frais_pro"] == 100.0
    assert data["mois"]["nombre_mouvements"] == 2
    assert data["tresorerie"]["solde_disponible"] == 17000.0
    assert [e["libelle"] for e in data["echeances_a_venir"]] == ["Urssaf : septembre 2026"]


def test_template_without_ai() -> None:
    md = template(collect(api().client(), "2026-09"))
    assert md.startswith("# Rapport de septembre 2026")
    assert f"17{NNBSP}000,00 €" in md
    assert "avant le 31/10/2026" in md
    assert "EURL à l'IR" in md and f"-5{NNBSP}000,00 €" in md
    assert md.rstrip().endswith("_Ce n'est pas un conseil._")


def test_generate_uses_the_model_text_when_available() -> None:
    store = FakeStore()
    model = ScriptedModel(script=[AIMessage(content="# Rapport de septembre 2026\n\nRédigé.")])
    rid = generate(api().client(), store, "2026-09", model)  # type: ignore[arg-type]
    assert rid == 1
    assert store.saved[0][2].endswith("Rédigé.")
    # The model only saw the collected figures.
    assert "17000.0" in str(model.seen[0][-1].content)


def test_generate_without_model_stores_the_template() -> None:
    store = FakeStore()
    generate(api().client(), store, "2026-09", None)  # type: ignore[arg-type]
    assert store.saved[0][1] == "Rapport de septembre 2026"
    assert store.saved[0][2].startswith("# Rapport de septembre 2026")
