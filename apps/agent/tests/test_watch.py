from datetime import date
from typing import Any

from copilot.store import KnowledgeHit
from copilot.watch import Extraction, as_engine_value, check, numbers_in, run_watch

from .conftest import FakeApi

TODAY = date(2026, 10, 13)
NBSP = "\u00a0"
URL_A = "https://www.urssaf.fr/taux"
URL_B = "https://entreprendre.service-public.gouv.fr/vosdroits/F23267"
TABLE = {
    "year": 2026,
    "modeleSocialVersion": "11.1.0",
    "rates": {
        "micro.cotisations.bnc.regime_general": {
            "unit": "rate",
            "value": 0.256,
            "source_url": URL_A,
            "verified_on": "2026-01-30",
            "note": "Taux global BNC.",
        },
        "micro.plafond_ca.bnc": {
            "unit": "eur",
            "value": 83600,
            "source_url": URL_B,
            "verified_on": "2026-05-13",
            "note": "Plafond micro.",
        },
        "micro.acre.date_bascule": {
            "unit": "date",
            "value": "2026-07-01",
            "source_url": URL_B,
            "verified_on": "2026-05-13",
        },
    },
}
PAGE_A = (
    "<html><body><article><p>À partir du 1er janvier 2026 : 25,6 % pour les BNC.</p>"
    "</article></body></html>"
)
PAGE_B = (
    f"<html><body><article><p>Le plafond est de 83{NBSP}600 € pour les prestations de "
    "services.</p></article></body></html>"
)


class FakeStore:
    def __init__(self) -> None:
        self.hashes: dict[str, str | None] = {}
        self.checks: dict[str, str] = {}
        self.proposals: list[dict[str, Any]] = []

    def save_source_check(
        self, url: str, digest: str | None, status: str, detail: str | None
    ) -> None:
        if digest is not None:
            self.hashes[url] = digest
        self.checks[url] = status

    def source_hash(self, url: str) -> str | None:
        return self.hashes.get(url)

    def has_pending_proposal(self, kind: str, subset: dict[str, Any]) -> bool:
        return any(
            p["kind"] == kind and all(p["payload"].get(k) == v for k, v in subset.items())
            for p in self.proposals
        )

    def create_proposal(
        self, kind: str, title: str, payload: dict[str, Any], thread: str | None, status: str
    ) -> int:
        self.proposals.append({"kind": kind, "title": title, "payload": payload})
        return len(self.proposals)

    def upsert_knowledge(self, *args: Any) -> None:
        raise AssertionError("no embeddings in these tests")

    def search(self, *args: Any, **kwargs: Any) -> list[KnowledgeHit]:
        raise AssertionError("no embeddings in these tests")


def api() -> FakeApi:
    return FakeApi({("GET", "/rates"): TABLE})


def pages(a: str = PAGE_A, b: str = PAGE_B, fail: set[str] | None = None):  # type: ignore[no-untyped-def]
    def fetch(url: str) -> str:
        if fail and url in fail:
            raise ConnectionResetError("reset by peer")
        return a if url == URL_A else b

    return fetch


def test_numbers_and_units() -> None:
    assert numbers_in(f"de 83{NBSP}600 € et 25,6 %") == {83600.0, 25.6}
    assert numbers_in("1.234,5 €") == {1234.5}
    assert as_engine_value({"unit": "rate"}, 25.6) == 0.256
    assert as_engine_value({"unit": "eur"}, 83600) == 83600


def test_check_guards() -> None:
    page = "Le taux global est de 25,6 % pour les BNC depuis 2026."
    rate = {"unit": "rate"}
    good = Extraction(
        found=True, value_as_written=25.6, quote="taux global est de 25,6 %", confident=True
    )
    assert check(good, page, rate) is None
    invented = good.model_copy(
        update={"quote": "taux global est de 27,1 %", "value_as_written": 27.1}
    )
    assert check(invented, page, rate) == "la citation ne figure pas mot pour mot dans la page"
    mismatch = good.model_copy(update={"value_as_written": 26.1})
    assert check(mismatch, page, rate) == "la valeur proposée ne figure pas dans la citation"
    unsure = good.model_copy(update={"confident": False})
    assert check(unsure, page, rate) == "le modèle n'est pas sûr de sa lecture"


def test_without_ai_detects_page_changes_once() -> None:
    store = FakeStore()
    first = run_watch(api().client(), store, pages(), TODAY)  # type: ignore[arg-type]
    assert {s["status"] for s in first.sources} == {"ok"}
    assert first.proposals == []

    changed = pages(a=PAGE_A.replace("25,6", "26,1"))
    second = run_watch(api().client(), store, changed, TODAY)  # type: ignore[arg-type]
    assert [p["kind"] for p in store.proposals] == ["source_changed"]
    assert store.proposals[0]["payload"]["keys"] == ["micro.cotisations.bnc.regime_general"]
    assert second.proposals == [1]

    run_watch(api().client(), store, changed, TODAY)  # type: ignore[arg-type]
    assert len(store.proposals) == 1, "no duplicate while the first one is pending"


def test_unreachable_source_does_not_stop_the_run() -> None:
    store = FakeStore()
    summary = run_watch(api().client(), store, pages(fail={URL_A}), TODAY)  # type: ignore[arg-type]
    by_url = {s["url"]: s["status"] for s in summary.sources}
    assert by_url == {URL_A: "unreachable", URL_B: "ok"}


def test_extraction_confirms_or_proposes_with_patch() -> None:
    def extractor(key: str, rate: dict[str, Any], excerpts: list[str]) -> Extraction:
        if key.startswith("micro.cotisations"):
            return Extraction(
                found=True,
                value_as_written=25.6,
                quote="2026 : 25,6 % pour les BNC",
                confident=True,
            )
        return Extraction(
            found=True, value_as_written=85000, quote="Le plafond est de 85 000 €", confident=True
        )

    store = FakeStore()
    page_b = PAGE_B.replace(f"83{NBSP}600", f"85{NBSP}000")
    summary = run_watch(api().client(), store, pages(b=page_b), TODAY, extractor=extractor)  # type: ignore[arg-type]
    assert summary.confirmed == ["micro.cotisations.bnc.regime_general"]
    change = next(p for p in store.proposals if p["kind"] == "rate_change")
    assert change["payload"]["current"] == 83600
    assert change["payload"]["proposed"] == 85000
    patched = change["payload"]["patch"]["micro.plafond_ca.bnc"]
    assert patched["value"] == 85000
    assert patched["verified_on"] == "2026-10-13"
    assert patched["source_url"] == URL_B


def test_hallucinated_value_is_rejected() -> None:
    def extractor(key: str, rate: dict[str, Any], excerpts: list[str]) -> Extraction:
        return Extraction(
            found=True, value_as_written=90000, quote="Le plafond est de 90 000 €", confident=True
        )

    store = FakeStore()
    summary = run_watch(api().client(), store, pages(), TODAY, extractor=extractor)  # type: ignore[arg-type]
    assert [p for p in store.proposals if p["kind"] == "rate_change"] == []
    assert {r["key"] for r in summary.rejected} == {
        "micro.cotisations.bnc.regime_general",
        "micro.plafond_ca.bnc",
    }


def test_dependency_update() -> None:
    store = FakeStore()
    run_watch(api().client(), store, pages(), TODAY, npm_latest=lambda: "11.1.0")  # type: ignore[arg-type]
    assert store.proposals == []
    summary = run_watch(api().client(), store, pages(), TODAY, npm_latest=lambda: "11.2.0")  # type: ignore[arg-type]
    assert store.proposals[-1]["kind"] == "dependency_update"
    assert summary.dependency == {"current": "11.1.0", "latest": "11.2.0"}
