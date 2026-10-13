# copilot (apps/agent)

Agents of Finance Cockpit, in Python: LangGraph for the graphs, Celery for background and
scheduled tasks, Postgres + pgvector for memory, OpenAI for the models.

## Principles

- **No invented numbers.** Every amount comes from the TypeScript API, which runs the engine
  (`/api/simulate`, `/api/cockpit`…). The prompt forbids computing; the tools return euros
  converted from the engine's cents.
- **Writes are confirmed.** Write tools call LangGraph `interrupt()`: the graph pauses, the web
  app shows the exact action, and nothing is sent to the API until the user approves. Every
  decision is recorded in `agent_proposals`.
- **Tool output is data.** Labels, notes and fetched pages never become instructions.
- **Without `OPENAI_API_KEY`** the app works; the copilot answers 503 with a clear message.

## Layout

| Module          | Role                                                                 |
| --------------- | -------------------------------------------------------------------- |
| `config.py`     | Settings from the environment (`infra/.env`)                         |
| `auth.py`       | Cloudflare Access JWT verification (same rules as the API)           |
| `api_client.py` | Calls to the API with the internal service token                     |
| `tools.py`      | Read tools (cockpit, simulate, knowledge…) and confirmed write tools |
| `graph.py`      | Copilot graph: model ⇄ tools, Postgres checkpoints                   |
| `store.py`      | `agent_knowledge` (pgvector), `agent_proposals`, `agent_reports`     |
| `knowledge.py`  | Indexes sourced rates and engine assumptions                         |
| `tasks.py`      | Celery app and schedule (beat)                                       |
| `server.py`     | FastAPI service under `/agent/` (behind nginx)                       |

Tables are created by the Drizzle migrations (`db/migrations`); LangGraph creates its own
`checkpoint*` tables at start.

## Services (docker compose)

| Service        | Command                         | Network                    |
| -------------- | ------------------------------- | -------------------------- |
| `agent`        | `uvicorn copilot.main:app`      | backend + agent-egress     |
| `agent-worker` | `celery -A copilot.tasks worker` | backend + agent-egress    |
| `agent-beat`   | `celery -A copilot.tasks beat`  | backend                    |
| `redis`        | Celery broker, not persisted    | backend (internal)         |

## Development

```sh
cd apps/agent
uv sync
uv run ruff check src tests && uv run ruff format --check src tests && uv run mypy
uv run pytest                       # unit tests (scripted model, no OpenAI call)
TEST_DATABASE_URL=postgresql://… uv run pytest   # + pgvector integration tests
```

Dependencies are pinned in `uv.lock`; `[tool.uv] exclude-newer` refuses anything published in the
last two weeks, transitive dependencies included.
