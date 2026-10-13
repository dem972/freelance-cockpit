# Contributing

Thanks for helping! This project handles people's money and taxes, so the bar is about
**correctness and traceability** before features.

## Ground rules

1. **No rate or threshold without an official source and a verification date.** Rates live in
   `packages/engine/rates/<year>.json`; each entry has `value`, `unit`, `source_url`,
   `verified_on` and a `note`. Acceptable sources: urssaf.fr, autoentrepreneur.urssaf.fr,
   service-public.gouv.fr, impots.gouv.fr, legifrance.gouv.fr, bofip.impots.gouv.fr. If two
   official sources disagree, add `"flag": "conflict"` and explain in the note.
2. **Never compute money with floats.** Amounts are integer cents; rounding is explicit and
   documented in `packages/engine/README.md`.
3. **The engine stays pure**: no network, disk or implicit date (`new Date()` without arguments).
4. **The AI never produces numbers.** Agents call the API / engine; writes go through an approval
   step (`interrupt()`).
5. **No new dependency without a one-line justification** in the PR. We refuse packages published
   less than two weeks ago (`exclude-newer` for Python, exact pins for JS).
6. **Strict types**: TypeScript `strict`, no `any`; Python `mypy --strict`.

## Reporting a wrong rate

Open a **Rate correction** issue with the official URL, the exact quote and the date you checked.
That is often enough for a maintainer to fix it; a PR is even better.

## Development

```sh
pnpm install
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test   # TypeScript
cd apps/agent && uv sync && uv run ruff check src tests && uv run mypy && uv run pytest   # Python
```

Engine changes must keep `packages/engine/src/oracle.test.ts` green (comparison with the Urssaf
rules). Add tests for thresholds you touch.

## Sign your commits (DCO)

By contributing you certify the [Developer Certificate of Origin](https://developercertificate.org/):
you wrote the change or have the right to submit it under the project's license. Sign off each
commit:

```sh
git commit -s -m "engine: fix CFP rate for Cipav"
```

The `Signed-off-by` line keeps the provenance of every contribution clear, which also lets the
maintainer offer other licensing terms later without having to track everyone down.

## Pull requests

- One topic per PR, small commits, CI green (lint, format, typecheck, tests, compose smoke test).
- Describe what changed for the user and how you verified it.
- UI text is in French; code, comments and docs are in English.

## Code of conduct

Be kind, assume good faith, focus on the work. Harassment or discrimination is not tolerated;
maintainers may remove comments or ban participants who do not respect this. Report problems to
the maintainer listed in [SECURITY.md](SECURITY.md).
