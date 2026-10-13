## What changes for the user

## How it was verified

- [ ] `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test`
- [ ] Agents (if touched): `uv run ruff check src tests && uv run mypy && uv run pytest`
- [ ] Rates touched: official `source_url`, `verified_on`, oracle test still green
- [ ] New dependency: one-line justification below, published more than two weeks ago
- [ ] Commits signed off (`git commit -s`)
