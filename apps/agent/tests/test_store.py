"""Integration: the pgvector store against a real Postgres with the real migrations.

Run with TEST_DATABASE_URL pointing to an empty pgvector database.
"""

import math
import os
from pathlib import Path

import psycopg
import pytest

from copilot.store import Store, make_pool

URL = os.environ.get("TEST_DATABASE_URL")
pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(URL is None, reason="TEST_DATABASE_URL not set"),
]
MIGRATIONS = Path(__file__).parents[3] / "db" / "migrations"


def unit(*hot: int) -> list[float]:
    """1536-d vector with ones at the given positions, normalised."""
    v = [0.0] * 1536
    for i in hot:
        v[i] = 1.0
    n = math.sqrt(sum(x * x for x in v))
    return [x / n for x in v]


@pytest.fixture(scope="module")
def store() -> Store:
    assert URL is not None
    with psycopg.connect(URL, autocommit=True) as conn:
        conn.execute("drop schema public cascade; create schema public;")
        for sql in sorted(MIGRATIONS.glob("*.sql")):
            for statement in sql.read_text().split("--> statement-breakpoint"):
                if statement.strip():
                    conn.execute(statement)  # type: ignore[call-overload]
    return Store(make_pool(URL))


def test_knowledge_upsert_and_similarity_search(store: Store) -> None:
    store.upsert_knowledge("rate", "2026:a", "taux A", {"k": 1}, unit(0))
    store.upsert_knowledge("rate", "2026:b", "taux B", {}, unit(1))
    store.upsert_knowledge("memory", "pref", "préférence", {}, unit(0, 1))
    store.upsert_knowledge("rate", "2026:a", "taux A v2", {"k": 2}, unit(0))

    hits = store.search(unit(0), limit=2)
    assert hits[0].content == "taux A v2"
    assert hits[0].metadata == {"k": 2}
    assert hits[0].distance == pytest.approx(0, abs=1e-6)

    only_rates = store.search(unit(0, 1), limit=5, kinds=["rate"])
    assert {h.kind for h in only_rates} == {"rate"}

    store.delete_knowledge("rate", {"2026:b"})
    assert store.knowledge_refs("rate") == {"2026:a"}


def test_proposals_and_reports(store: Store) -> None:
    pid = store.create_proposal("rate_change", "Taux X", {"key": "x"}, None, "pending")
    assert store.list_proposals(kind="rate_change", status="pending")[0]["id"] == pid
    store.decide_proposal(pid, "approved")
    assert store.get_proposal(pid)["status"] == "approved"  # type: ignore[index]

    rid = store.insert_report("2026-09", "Rapport septembre", "# Titre", {"net": 1})
    assert store.list_reports()[0]["id"] == rid
    assert store.get_report(rid)["markdown"] == "# Titre"  # type: ignore[index]
