"""Tools of the copilot.

Read tools call the API (and therefore the engine): the model never computes an
amount itself. Write tools pause the graph with `interrupt` and only act once
the user approves the exact action shown to them.
"""

from collections.abc import Callable
from typing import Any, Literal

from langchain_core.tools import BaseTool, tool
from langgraph.types import interrupt

from .api_client import ApiClient, ApiError
from .llm import Embedder
from .store import Store

Json = Any


def euros(cents: int | float | None) -> float | None:
    return None if cents is None else round(cents / 100, 2)


def cents(value: float) -> int:
    return round(value * 100)


def fr_eur(value: float) -> str:
    """1234.5 → '1 234,50 €' (French formatting for the approval summary)."""
    return f"{value:,.2f} €".replace(",", "\u202f").replace(".", ",")


def fr_date(iso: str) -> str:
    """2026-10-12 → 12/10/2026 (left unchanged if not an ISO date)."""
    parts = iso.split("-")
    return f"{parts[2]}/{parts[1]}/{parts[0]}" if len(parts) == 3 else iso


def _breakdown(b: Json) -> Json:
    """The useful part of an engine breakdown, amounts in euros."""
    out = {
        "statut": b["statut"],
        "ca": euros(b["ca"]),
        "frais_pro": euros(b["fraisPro"]),
        "cotisations": euros(b["cotisations"]),
        "cfp": euros(b["cfp"]),
        "impot": euros(b["impot"]),
        "net": euros(b["net"]),
        "alertes_moteur": [w["message"] for w in b.get("warnings", [])],
    }
    if b.get("netRange"):
        out["net_fourchette"] = [euros(b["netRange"]["min"]), euros(b["netRange"]["max"])]
    if b.get("acre"):
        out["acre"] = {
            "fin": b["acre"]["fin"],
            "economie": euros(b["acre"]["economie"]),
        }
    return out


Decision = dict[str, Any]
Recorder = Callable[[str, str, dict[str, Any], str], None]


def _confirm(action: str, summary: str, details: dict[str, Any], record: Recorder) -> bool:
    """Pauses the graph until the user approves or refuses this exact action."""
    decision: Decision = interrupt({"action": action, "summary": summary, "details": details})
    approved = bool(decision.get("approved"))
    record(action, summary, details, "approved" if approved else "rejected")
    return approved


REFUSED = "L'utilisateur a refusé cette action : rien n'a été enregistré."


def make_tools(
    api: ApiClient,
    year: int,
    store: Store | None = None,
    embed: Embedder | None = None,
    thread_id: str | None = None,
) -> list[BaseTool]:
    def record(action: str, summary: str, details: dict[str, Any], status: str) -> None:
        if store is not None:
            store.create_proposal(
                "write_action", summary, {"action": action, **details}, thread_id, status
            )

    # --- read ------------------------------------------------------------------
    @tool
    def get_cockpit() -> Json:
        """Situation de trésorerie de l'année : solde, solde disponible, provisions non payées,
        couverture, CA et net réalisés / projetés / prévus, échéances à venir. Montants en euros."""
        d = api.cockpit(year)
        return {
            "date": d["asOf"],
            "solde_bancaire": euros(d["balance"]["balance"]),
            "provisions_non_payees": euros(d["balance"]["provisionsUnpaid"]),
            "solde_disponible": euros(d["balance"]["available"]),
            "couverture": d["coverage"]["ratio"],
            "prochaine_echeance": d["coverage"]["next"],
            "realise": _breakdown(d["realised"]),
            "projete_fin_annee": _breakdown(d["projected"]),
            "previsionnel": _breakdown(d["plan"]),
            "echeances_non_payees": [
                {
                    "id": x["id"],
                    "libelle": x["label"],
                    "echeance": x["dueOn"],
                    "montant": euros(x["amountDue"]),
                }
                for x in d["deadlines"]
                if x["paidOn"] is None and x["amountDue"] > 0
            ],
        }

    @tool
    def get_alerts() -> Json:
        """Alertes actives (calculées par des règles, sans IA) : couverture, échéances, seuils."""
        return api.alerts(year)

    @tool
    def list_transactions(month: int | None = None) -> Json:
        """Mouvements bancaires saisis (encaissements, frais, paiements), avec leurs provisions.
        `month` (1-12) pour filtrer."""
        rows = api.transactions(year)
        if month is not None:
            rows = [r for r in rows if int(r["date"][5:7]) == month]
        return [
            {
                "id": r["id"],
                "date": r["date"],
                "libelle": r["label"],
                "type": r["kind"],
                "montant_ttc": euros(r["amount"]),
                "tva": euros(r["vatAmount"]),
                "provisions": {p["kind"]: euros(p["amount"]) for p in r["provisions"]},
            }
            for r in rows
        ]

    @tool
    def list_invoices() -> Json:
        """Factures de l'année (numéro, client, montants, date d'encaissement)."""
        return [
            {
                "id": i["id"],
                "numero": i["number"],
                "client": i["client"],
                "emise_le": i["issuedOn"],
                "montant_ht": euros(i["amountHt"]),
                "tva": euros(i["vatAmount"]),
                "encaissee_le": i["paidOn"],
            }
            for i in api.invoices(year)
        ]

    @tool
    def get_settings() -> Json:
        """Réglages datés (statut, caisse, TVA, VFL, Acre, foyer…) et prévisionnel de l'année."""
        return {"reglages": api.settings_timeline(), "previsionnel": api.projection(year)}

    @tool
    def simulate(
        tjm: float,
        jours_par_mois: float | list[float],
        frais_mensuels: float = 0,
        reglages: dict[str, Any] | None = None,
    ) -> Json:
        """Simule l'année avec le moteur officiel, pour les 5 statuts (micro-BNC, EURL IR, EURL IS,
        SASU, portage). `tjm` et `frais_mensuels` en euros HT ; `jours_par_mois` : un nombre ou
        12 valeurs ; `reglages` : options du moteur à changer (ex. {"versementLiberatoire": true,
        "partRemuneration": 0.5}). Utilise cet outil pour TOUT chiffre de simulation."""
        body = {
            "year": year,
            "tjm": tjm,
            "joursParMois": jours_par_mois,
            "fraisMensuels": frais_mensuels,
            "settings": reglages or {},
        }
        return [_breakdown(b) for b in api.simulate(body)]

    @tool
    def search_knowledge(question: str) -> Json:
        """Cherche dans les taux et seuils sourcés et dans les hypothèses du moteur (recherche
        sémantique). À utiliser pour citer une source officielle ou expliquer une règle."""
        if store is None or embed is None:
            return "Base de connaissances indisponible."
        hits = store.search(embed.embed_query(question), limit=5)
        return [
            {"type": h.kind, "contenu": h.content, "distance": round(h.distance, 3)} for h in hits
        ]

    # --- write (confirmed) ------------------------------------------------------
    @tool
    def add_transaction(
        date: str,
        label: str,
        amount_ttc: float,
        kind: Literal["encaissement", "frais_pro", "autre"],
        vat: float = 0,
    ) -> str:
        """Propose d'enregistrer un mouvement (montants en euros, TTC, positifs ; un frais sera
        enregistré en sortie). L'utilisateur valide avant tout enregistrement."""
        signed = -abs(amount_ttc) if kind == "frais_pro" else amount_ttc
        details = {"date": date, "libelle": label, "type": kind, "montant_ttc": signed, "tva": vat}
        summary = f"Enregistrer « {label} » : {fr_eur(signed)} le {fr_date(date)}"
        if not _confirm("add_transaction", summary, details, record):
            return REFUSED
        try:
            api.add_transaction(
                {
                    "date": date,
                    "label": label,
                    "amount": cents(signed),
                    "kind": kind,
                    "vatAmount": cents(vat),
                    "invoiceId": None,
                    "deadlineId": None,
                }
            )
        except ApiError as e:
            return f"Échec de l'enregistrement : {e}"
        return "Mouvement enregistré ; provisions et échéances recalculées."

    @tool
    def add_invoice(
        number: str,
        client: str,
        issued_on: str,
        amount_ht: float,
        vat: float = 0,
        due_on: str | None = None,
    ) -> str:
        """Propose de créer une facture (montants en euros). L'utilisateur valide d'abord."""
        details = {
            "numero": number,
            "client": client,
            "emise_le": issued_on,
            "montant_ht": amount_ht,
            "tva": vat,
        }
        summary = f"Créer la facture {number} pour {client} : {fr_eur(amount_ht)} HT"
        if not _confirm("add_invoice", summary, details, record):
            return REFUSED
        try:
            api.add_invoice(
                {
                    "number": number,
                    "client": client,
                    "issuedOn": issued_on,
                    "dueOn": due_on,
                    "amountHt": cents(amount_ht),
                    "vatAmount": cents(vat),
                    "paidOn": None,
                    "note": None,
                }
            )
        except ApiError as e:
            return f"Échec : {e}"
        return "Facture créée."

    @tool
    def mark_invoice_paid(invoice_id: int, date: str) -> str:
        """Propose de marquer une facture encaissée (crée l'encaissement et ses provisions)."""
        summary = f"Marquer la facture #{invoice_id} encaissée le {fr_date(date)}"
        if not _confirm(
            "mark_invoice_paid", summary, {"facture": invoice_id, "date": date}, record
        ):
            return REFUSED
        try:
            api.pay_invoice(invoice_id, date)
        except ApiError as e:
            return f"Échec : {e}"
        return "Facture encaissée ; provisions recalculées."

    @tool
    def pay_deadline(deadline_id: int, date: str) -> str:
        """Propose de marquer une échéance payée (enregistre la sortie correspondante)."""
        summary = f"Marquer l'échéance #{deadline_id} payée le {fr_date(date)}"
        if not _confirm("pay_deadline", summary, {"echeance": deadline_id, "date": date}, record):
            return REFUSED
        try:
            api.pay_deadline(deadline_id, date)
        except ApiError as e:
            return f"Échec : {e}"
        return "Échéance payée."

    @tool
    def change_settings(valid_from: str, changes: dict[str, Any]) -> str:
        """Propose un changement de réglages à partir d'une date (ex. {"tva": "assujetti"},
        {"versementLiberatoire": true}, {"statut": "sasu"}, {"parts": 2.5}). Noms de champs du
        moteur : statut, caisse, versementLiberatoire, acreDebutActivite, tva, periodiciteUrssaf,
        situationFamiliale, parts, autresRevenusImposables (centimes), partRemuneration,
        capitalEtComptesCourants (centimes), fraisGestionPortage."""
        summary = f"À partir du {valid_from} : " + ", ".join(
            f"{k} = {v}" for k, v in changes.items()
        )
        if not _confirm("change_settings", summary, {"a_partir_du": valid_from, **changes}, record):
            return REFUSED
        timeline = list(api.settings_timeline())
        existing = next((p for p in timeline if p["validFrom"] == valid_from), None)
        if existing is not None:
            existing["settings"] = {**existing["settings"], **changes}
        elif timeline and valid_from < timeline[0]["validFrom"]:
            timeline.insert(
                0, {"validFrom": valid_from, "settings": {**timeline[0]["settings"], **changes}}
            )
        else:
            timeline.append({"validFrom": valid_from, "settings": changes})
        try:
            api.put_settings(timeline)
        except ApiError as e:
            return f"Échec : {e}"
        return "Réglages enregistrés ; tout a été recalculé."

    @tool
    def add_days_off(dates: list[str]) -> str:
        """Propose de poser des jours de congé dans le prévisionnel (dates AAAA-MM-JJ) ; les
        jours facturables et le net projeté sont recalculés."""
        shown = ", ".join(dates[:6]) + ("…" if len(dates) > 6 else "")
        summary = f"Poser {len(dates)} jour(s) de congé : {shown}"
        if not _confirm("add_days_off", summary, {"dates": dates}, record):
            return REFUSED
        projection = api.projection(year)
        if projection is None:
            return "Aucun prévisionnel enregistré : crée-le d'abord dans Réglages."
        projection["conges"] = sorted(set(projection.get("conges", [])) | set(dates))
        projection["joursDepuisCalendrier"] = True
        try:
            api.put_projection(year, projection)
        except ApiError as e:
            return f"Échec : {e}"
        return "Congés posés ; prévisionnel recalculé."

    @tool
    def remember(fact: str) -> str:
        """Mémorise une préférence ou un fait durable donné par l'utilisateur (pas de chiffres
        calculés)."""
        if store is None or embed is None:
            return "Mémoire indisponible."
        store.upsert_knowledge("memory", fact[:200], fact, {}, embed.embed_query(fact))
        return "C'est noté."

    return [
        get_cockpit,
        get_alerts,
        list_transactions,
        list_invoices,
        get_settings,
        simulate,
        search_knowledge,
        add_transaction,
        add_invoice,
        mark_invoice_paid,
        pay_deadline,
        change_settings,
        add_days_off,
        remember,
    ]


WRITE_TOOLS = {
    "add_transaction",
    "add_invoice",
    "mark_invoice_paid",
    "pay_deadline",
    "change_settings",
    "add_days_off",
}
