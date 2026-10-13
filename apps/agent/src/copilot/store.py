"""Agent tables in Postgres: knowledge (pgvector), proposals, reports."""

from dataclasses import dataclass
from typing import Any

from pgvector.psycopg import register_vector
from psycopg import Connection
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from psycopg_pool import ConnectionPool


def _configure(conn: Connection[Any]) -> None:
    register_vector(conn)


def make_pool(database_url: str) -> ConnectionPool[Connection[dict[str, Any]]]:
    return ConnectionPool(
        database_url,
        min_size=1,
        max_size=5,
        kwargs={"autocommit": True, "row_factory": dict_row},
        configure=_configure,
        open=True,
    )


@dataclass(frozen=True)
class KnowledgeHit:
    kind: str
    ref: str
    content: str
    metadata: dict[str, Any]
    distance: float


class Store:
    def __init__(self, pool: ConnectionPool[Connection[dict[str, Any]]]) -> None:
        self.pool = pool

    # --- knowledge ----------------------------------------------------------------
    def upsert_knowledge(
        self, kind: str, ref: str, content: str, metadata: dict[str, Any], embedding: list[float]
    ) -> None:
        with self.pool.connection() as conn:
            conn.execute(
                """
                insert into agent_knowledge (kind, ref, content, metadata, embedding)
                values (%s, %s, %s, %s, %s::vector)
                on conflict (kind, ref) do update
                  set content = excluded.content, metadata = excluded.metadata,
                      embedding = excluded.embedding, created_at = now()
                """,
                (kind, ref, content, Jsonb(metadata), embedding),
            )

    def knowledge_refs(self, kind: str) -> set[str]:
        with self.pool.connection() as conn:
            rows = conn.execute(
                "select ref from agent_knowledge where kind = %s", (kind,)
            ).fetchall()
        return {str(r["ref"]) for r in rows}

    def delete_knowledge(self, kind: str, refs: set[str]) -> None:
        if not refs:
            return
        with self.pool.connection() as conn:
            conn.execute(
                "delete from agent_knowledge where kind = %s and ref = any(%s)", (kind, list(refs))
            )

    def search(
        self,
        embedding: list[float],
        limit: int = 5,
        kinds: list[str] | None = None,
        url: str | None = None,
    ) -> list[KnowledgeHit]:
        with self.pool.connection() as conn:
            rows = conn.execute(
                """
                select kind, ref, content, metadata, embedding <=> %s::vector as distance
                from agent_knowledge
                where (%s::text[] is null or kind = any(%s::text[]))
                  and (%s::text is null or metadata->>'url' = %s)
                order by embedding <=> %s::vector
                limit %s
                """,
                (embedding, kinds, kinds, url, url, embedding, limit),
            ).fetchall()
        return [
            KnowledgeHit(
                kind=str(r["kind"]),
                ref=str(r["ref"]),
                content=str(r["content"]),
                metadata=dict(r["metadata"]),
                distance=float(r["distance"]),
            )
            for r in rows
        ]

    # --- proposals --------------------------------------------------------------
    def create_proposal(
        self, kind: str, title: str, payload: dict[str, Any], thread_id: str | None, status: str
    ) -> int:
        with self.pool.connection() as conn:
            row = conn.execute(
                """
                insert into agent_proposals (kind, title, payload, thread_id, status, decided_at)
                values (%s, %s, %s, %s, %s, case when %s = 'pending' then null else now() end)
                returning id
                """,
                (kind, title, Jsonb(payload), thread_id, status, status),
            ).fetchone()
        assert row is not None
        return int(row["id"])

    def list_proposals(
        self, kind: str | None = None, status: str | None = None
    ) -> list[dict[str, Any]]:
        with self.pool.connection() as conn:
            rows = conn.execute(
                """
                select id, kind, title, payload, status, thread_id,
                       created_at::text as created_at, decided_at::text as decided_at
                from agent_proposals
                where (%s::text is null or kind = %s) and (%s::text is null or status = %s)
                order by created_at desc limit 200
                """,
                (kind, kind, status, status),
            ).fetchall()
        return [dict(r) for r in rows]

    def has_pending_proposal(self, kind: str, payload_subset: dict[str, Any]) -> bool:
        with self.pool.connection() as conn:
            row = conn.execute(
                """
                select 1 from agent_proposals
                where kind = %s and status = 'pending' and payload @> %s limit 1
                """,
                (kind, Jsonb(payload_subset)),
            ).fetchone()
        return row is not None

    def get_proposal(self, proposal_id: int) -> dict[str, Any] | None:
        with self.pool.connection() as conn:
            row = conn.execute(
                "select id, kind, title, payload, status from agent_proposals where id = %s",
                (proposal_id,),
            ).fetchone()
        return dict(row) if row is not None else None

    def decide_proposal(self, proposal_id: int, status: str) -> None:
        with self.pool.connection() as conn:
            conn.execute(
                "update agent_proposals set status = %s, decided_at = now() where id = %s",
                (status, proposal_id),
            )

    # --- reports ---------------------------------------------------------------
    def insert_report(self, period: str, title: str, markdown: str, data: dict[str, Any]) -> int:
        with self.pool.connection() as conn:
            row = conn.execute(
                """
                insert into agent_reports (period, title, markdown, data)
                values (%s, %s, %s, %s) returning id
                """,
                (period, title, markdown, Jsonb(data)),
            ).fetchone()
        assert row is not None
        return int(row["id"])

    def list_reports(self) -> list[dict[str, Any]]:
        with self.pool.connection() as conn:
            rows = conn.execute(
                """
                select id, period, title, created_at::text as created_at
                from agent_reports order by created_at desc limit 100
                """
            ).fetchall()
        return [dict(r) for r in rows]

    def get_report(self, report_id: int) -> dict[str, Any] | None:
        with self.pool.connection() as conn:
            row = conn.execute(
                """
                select id, period, title, markdown, data, created_at::text as created_at
                from agent_reports where id = %s
                """,
                (report_id,),
            ).fetchone()
        return dict(row) if row is not None else None

    # --- rates watch ---------------------------------------------------------------
    def source_hash(self, url: str) -> str | None:
        with self.pool.connection() as conn:
            row = conn.execute(
                "select content_hash from source_checks where url = %s", (url,)
            ).fetchone()
        return None if row is None or row["content_hash"] is None else str(row["content_hash"])

    def save_source_check(
        self, url: str, digest: str | None, status: str, detail: str | None
    ) -> None:
        with self.pool.connection() as conn:
            conn.execute(
                """
                insert into source_checks (url, content_hash, status, detail, checked_at)
                values (%s, %s, %s, %s, now())
                on conflict (url) do update set
                  content_hash = coalesce(excluded.content_hash, source_checks.content_hash),
                  status = excluded.status, detail = excluded.detail, checked_at = now()
                """,
                (url, digest, status, detail),
            )

    def list_source_checks(self) -> list[dict[str, Any]]:
        with self.pool.connection() as conn:
            rows = conn.execute(
                """
                select url, status, detail, checked_at::text as checked_at
                from source_checks order by url
                """
            ).fetchall()
        return [dict(r) for r in rows]

    def start_run(self) -> int:
        with self.pool.connection() as conn:
            row = conn.execute(
                "insert into rates_watch_runs default values returning id"
            ).fetchone()
        assert row is not None
        return int(row["id"])

    def finish_run(self, run_id: int, summary: dict[str, Any]) -> None:
        with self.pool.connection() as conn:
            conn.execute(
                "update rates_watch_runs set finished_at = now(), summary = %s where id = %s",
                (Jsonb(summary), run_id),
            )

    def list_runs(self, limit: int = 10) -> list[dict[str, Any]]:
        with self.pool.connection() as conn:
            rows = conn.execute(
                """
                select id, started_at::text as started_at, finished_at::text as finished_at, summary
                from rates_watch_runs order by started_at desc limit %s
                """,
                (limit,),
            ).fetchall()
        return [dict(r) for r in rows]
