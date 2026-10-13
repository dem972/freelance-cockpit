"""Monthly reports: figures from the API, text from a template or from the model.

Without an OpenAI key the deterministic template is the report. With a key, the model
rewrites it into a readable synthesis, using only the figures it is given.
"""

import json
from datetime import date
from typing import Any

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage

from .api_client import ApiClient
from .store import Store
from .tools import _breakdown, euros, fr_date, fr_eur

MONTHS = [
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
]  # fmt: skip


def previous_month(today: date) -> str:
    year, month = (today.year, today.month - 1) if today.month > 1 else (today.year - 1, 12)
    return f"{year}-{month:02d}"


def collect(api: ApiClient, period: str) -> dict[str, Any]:
    """Every figure of the report, from the API (engine). Amounts in euros."""
    year, month = int(period[:4]), int(period[5:7])
    cockpit = api.cockpit(year)
    moves = [t for t in api.transactions(year) if int(t["date"][5:7]) == month]
    optimisation = api.optimize(year)
    return {
        "periode": period,
        "date_calcul": cockpit["asOf"],
        "tresorerie": {
            "solde_bancaire": euros(cockpit["balance"]["balance"]),
            "provisions_non_payees": euros(cockpit["balance"]["provisionsUnpaid"]),
            "solde_disponible": euros(cockpit["balance"]["available"]),
            "couverture": cockpit["coverage"]["ratio"],
        },
        "mois": {
            "encaissements": euros(
                sum(t["amount"] - t["vatAmount"] for t in moves if t["kind"] == "encaissement")
            ),
            "frais_pro": euros(
                sum(-t["amount"] - t["vatAmount"] for t in moves if t["kind"] == "frais_pro")
            ),
            "nombre_mouvements": len(moves),
            "ca_prevu": euros(
                next((m["ca"] for m in cockpit["plan"]["months"] if m["month"] == month), 0)
            ),
        },
        "annee": {
            "realise": _breakdown(cockpit["realised"]),
            "projete": _breakdown(cockpit["projected"]),
            "previsionnel": _breakdown(cockpit["plan"]),
        },
        "echeances_a_venir": [
            {"libelle": d["label"], "echeance": d["dueOn"], "montant": euros(d["amountDue"])}
            for d in cockpit["deadlines"]
            if d["paidOn"] is None and d["amountDue"] > 0
        ],
        "alertes": [
            {"niveau": a["severity"], "titre": a["title"], "detail": a["message"]}
            for a in api.alerts(year)
        ],
        "optimisations": {
            "situation_actuelle": {
                "titre": optimisation["baseline"]["title"],
                "net": euros(optimisation["baseline"]["net"]),
            },
            "options": [
                {"titre": o["title"], "net": euros(o["net"]), "ecart": euros(o["gain"])}
                for o in optimisation["options"][:4]
            ],
            "avertissement": optimisation["disclaimer"],
        },
    }


def template(data: dict[str, Any]) -> str:
    """Deterministic report: always available, no model involved."""
    year, month = int(data["periode"][:4]), int(data["periode"][5:7])
    t, m, a = data["tresorerie"], data["mois"], data["annee"]
    lines = [
        f"# Rapport de {MONTHS[month - 1]} {year}",
        "",
        "## Trésorerie",
        f"- Solde bancaire : **{fr_eur(t['solde_bancaire'])}**",
        f"- Provisions non payées : {fr_eur(t['provisions_non_payees'])}",
        f"- Solde disponible : **{fr_eur(t['solde_disponible'])}**",
        "",
        "## Le mois",
        f"- CA encaissé (HT) : **{fr_eur(m['encaissements'])}** "
        f"pour {fr_eur(m['ca_prevu'])} prévus",
        f"- Frais professionnels (HT) : {fr_eur(m['frais_pro'])}",
        f"- {m['nombre_mouvements']} mouvement(s) saisi(s)",
        "",
        "## L'année",
        f"- CA réalisé : {fr_eur(a['realise']['ca'])}, net réalisé {fr_eur(a['realise']['net'])}",
        f"- Projection fin d'année : CA {fr_eur(a['projete']['ca'])}, "
        f"net **{fr_eur(a['projete']['net'])}**",
        f"- Prévisionnel : net {fr_eur(a['previsionnel']['net'])}",
        "",
        "## Échéances à venir",
    ]
    echeances = data["echeances_a_venir"]
    lines += [
        f"- {e['libelle']} : {fr_eur(e['montant'])} avant le {fr_date(e['echeance'])}"
        for e in echeances
    ] or ["- Aucune."]
    lines += ["", "## Alertes"]
    lines += [f"- **{x['titre']}** : {x['detail']}" for x in data["alertes"]] or ["- Aucune."]
    o = data["optimisations"]
    lines += ["", "## Pistes chiffrées par le moteur"]
    lines += [
        f"- {x['titre']} : net {fr_eur(x['net'])} ({'+' if x['ecart'] >= 0 else ''}"
        f"{fr_eur(x['ecart'])} par rapport à aujourd'hui)"
        for x in o["options"]
    ]
    lines += ["", f"_{o['avertissement']}_"]
    return "\n".join(lines)


REPORT_PROMPT = """Tu rédiges le rapport mensuel d'un freelance, en français, en Markdown.
Utilise UNIQUEMENT les chiffres du JSON fourni : n'en calcule ni n'en invente aucun.
Structure : un titre (# Rapport de <mois> <année>), puis ## L'essentiel (3 puces maximum),
## Trésorerie, ## Le mois, ## L'année, ## Échéances à venir, ## Alertes, ## Pistes chiffrées.
Pas de tableau. Termine par l'avertissement fourni, en italique. Ce n'est pas un conseil fiscal :
présente les pistes comme des comparaisons, sans recommander de décision."""


def generate(api: ApiClient, store: Store, period: str, model: BaseChatModel | None) -> int:
    data = collect(api, period)
    markdown = template(data)
    if model is not None:
        reply = model.invoke(
            [
                SystemMessage(REPORT_PROMPT),
                HumanMessage(json.dumps(data, ensure_ascii=False)),
            ]
        )
        written = str(reply.text).strip()
        if written:
            markdown = written
    year, month = int(period[:4]), int(period[5:7])
    return store.insert_report(period, f"Rapport de {MONTHS[month - 1]} {year}", markdown, data)
