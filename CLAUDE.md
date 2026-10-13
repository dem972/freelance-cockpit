# Finance Cockpit — règles de travail

`BRIEF.md` fait foi. En cas de doute, poser la question plutôt que deviner.

## Règles

- Petits commits, un jalon à la fois, tests verts avant de passer au suivant.
- Aucun taux ou seuil fiscal sans source officielle (URSSAF, service-public, impots.gouv) et date de
  vérification, dans `packages/engine/rates/<année>.json`. Jamais de taux codé de mémoire ; tout taux
  non vérifié est signalé.
- Pas de dépendance ajoutée sans justification d'une ligne (dans la PR / le message de commit).
- Types stricts (`strict: true`), pas de `any`.
- Lint + format + typecheck + tests en CI (GitHub Actions) sur chaque PR.
- Documenter les hypothèses du moteur dans `packages/engine/README.md`.

## Invariants techniques

- `packages/engine` : fonctions pures, zéro I/O, pas de `new Date()` (la date est un paramètre).
- Montants en centimes entiers (`Cents`), `bigint` en base. Jamais de float pour de l'argent.
- Les réglages utilisateur (statut, VL, ACRE, TVA, parts, caisse…) sont datés (`valid_from`) :
  le moteur reçoit une chronologie de réglages, pas une config figée.
- L'API vérifie le JWT `Cf-Access-Jwt-Assertion` (signature + audience) ; ne jamais faire confiance
  au header seul.
- Secrets hors repo (`infra/.env`, git-ignoré). Images non-root, lockfile commité.

## Commandes

```sh
pnpm install
pnpm dev                 # api :3000 + web (Vite, proxy /api)
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
cd infra && cp .env.example .env    # AUTH_MODE=none for local development
docker compose up -d --build --wait       # http://127.0.0.1:8380
docker compose --profile prod up -d       # + cloudflared + backup (see infra/README.md)
infra/backup/test-restore.sh <age-key>    # monthly restore test
```
