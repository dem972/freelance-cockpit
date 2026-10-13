"""Indexes what the agents may cite: sourced rates and engine assumptions."""

from typing import Any

from .api_client import ApiClient
from .llm import Embedder
from .store import Store


def _rate_text(key: str, rate: dict[str, Any]) -> str:
    value = rate["value"]
    if rate["unit"] == "rate":
        shown = f"{value * 100:.4g} %"
    elif rate["unit"] == "eur":
        shown = f"{value} €"
    else:
        shown = str(value)
    note = rate.get("note") or ""
    flag = f" Attention : {rate['flag']}." if rate.get("flag") else ""
    return (
        f"Taux ou seuil « {key} » = {shown}. {note}{flag} "
        f"Source officielle : {rate['source_url']} (vérifié le {rate['verified_on']})."
    )


def index_knowledge(api: ApiClient, store: Store, embed: Embedder, year: int) -> int:
    """(Re)indexes rates and assumptions; returns the number of entries."""
    entries: list[tuple[str, str, str, dict[str, Any]]] = []

    table = api.rates(year)
    for key, rate in table["rates"].items():
        entries.append(("rate", f"{year}:{key}", _rate_text(key, rate), {"year": year, **rate}))

    seen: set[str] = set()
    for result in api.simulate({"year": year, "tjm": 500, "joursParMois": 18}):
        for assumption in result["assumptions"]:
            if assumption not in seen:
                seen.add(assumption)
                entries.append(
                    ("assumption", f"{year}:{len(seen)}", assumption, {"statut": result["statut"]})
                )

    vectors = embed.embed_documents([content for _, _, content, _ in entries])
    for (kind, ref, content, metadata), vector in zip(entries, vectors, strict=True):
        store.upsert_knowledge(kind, ref, content, metadata, vector)

    for kind in ("rate", "assumption"):
        current = {ref for k, ref, _, _ in entries if k == kind}
        stale = {r for r in store.knowledge_refs(kind) if r.startswith(f"{year}:")} - current
        store.delete_knowledge(kind, stale)
    return len(entries)
