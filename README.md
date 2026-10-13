# Finance Cockpit

**Self-hosted cash-flow cockpit and tax simulator for French freelancers.**
Every rate is sourced. Every amount comes from a tested engine. The AI copilot never invents a
number.

> ⚠️ Estimates only — not tax, legal or accounting advice. Always check with the official
> simulators (Urssaf, impots.gouv) or an accountant. The user interface is in French because the
> rules are French.

## What it does

|                         |                                                                                                                                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Simulator**           | From a daily rate (TJM), billed days and expenses: net income for Micro-BNC, EURL (IR / IS), SASU and portage salarial, side by side, with the breakdown "for you / contributions / tax / CFP". |
| **Cockpit**             | From your invoices and bank movements: available balance (balance − unpaid provisions), coverage before the next deadline, realised vs projected revenue and net, Urssaf schedule.              |
| **Sourced rates**       | Each rate and threshold carries its official source URL and verification date, shown next to the numbers. Conflicting sources are flagged, never hidden.                                        |
| **Dated settings**      | Status, VAT, versement libératoire, Acre, household… change during the year; the engine computes month by month.                                                                                |
| **Alerts**              | Deterministic rules: coverage, overdue / upcoming deadlines, VAT and micro thresholds, end of Acre.                                                                                             |
| **Copilot (optional)**  | Chat that reads your data and runs the engine; every write (entry, invoice, setting) waits for your approval.                                                                                   |
| **Reports & optimizer** | Monthly report (template, or written by the model from the same figures); optimizer replaying your real year one lever at a time.                                                               |
| **Rates watch**         | Weekly re-check of every official source; AI-read values are kept only if the quote is found verbatim on the page and contains the number.                                                      |

## How it is built

```
packages/engine   Pure TypeScript engine (browser + server), integer cents, sourced rates JSON
packages/shared   Types and zod schemas
apps/api          Hono + Drizzle (Postgres 16 + pgvector)
apps/web          React + Vite + shadcn/ui
apps/agent        Python: LangGraph + Celery + pgvector (copilot, reports, rates watch)
infra/            Docker Compose, nginx, Cloudflare Tunnel + Access, encrypted backups
```

- **Micro-BNC** is modelled from the official rates (`packages/engine/rates/2026.json`) and checked
  against [modele-social](https://www.npmjs.com/package/modele-social), the open-source rules
  behind mon-entreprise.urssaf.fr, on a 99-case grid.
- **EURL, SASU, portage** use modele-social for contributions and corporate tax; income tax uses
  the engine's own sourced barème. Portage is returned as a range.
- Read more: [engine](packages/engine/README.md) · [agents](apps/agent/README.md) ·
  [deployment](infra/README.md) · [design brief (FR)](BRIEF.md).

## Quick start (local)

Requirements: Node 24, pnpm 10, Docker.

```sh
git clone https://github.com/dem972/freelance-cockpit.git && cd freelance-cockpit
pnpm install

cp infra/.env.example infra/.env
# In infra/.env: set POSTGRES_PASSWORD, AGENT_API_TOKEN (openssl rand -hex 32), AUTH_MODE=none
cd infra && docker compose up -d --build --wait
open http://127.0.0.1:8380
```

`AUTH_MODE=none` is for local use only. To expose it, follow [infra/README.md](infra/README.md)
(Cloudflare Tunnel + Access, JWT verified by the API, encrypted off-site backups).

The copilot needs `OPENAI_API_KEY` in `infra/.env`; everything else works without it.

### Development

```sh
pnpm dev                                   # api :3000 + web (Vite)
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
cd apps/agent && uv sync && uv run pytest  # agents
```

## Status

Personal tool, single user, year 2026 rates. Statuts covered: Micro-BNC (BNC non réglementé and
Cipav), EURL IR/IS, SASU, portage salarial. Not covered: BIC micro activities, multi-user, bank
connections (planned behind a `TransactionSource` interface).

## Contributing

Contributions are welcome, especially rate corrections with an official source. See
[CONTRIBUTING.md](CONTRIBUTING.md). Security issues: [SECURITY.md](SECURITY.md).

## License

[GNU Affero General Public License v3.0 or later](LICENSE). If you run a modified version as a
network service, you must offer its source to its users (set `SOURCE_URL` so the footer links to
your fork).

Third-party: modele-social and publicodes (MIT, by Urssaf / beta.gouv.fr), shadcn/ui (MIT), and
the dependencies listed in the lockfiles.
