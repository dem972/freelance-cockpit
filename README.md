# Finance Cockpit

Outil perso de suivi du net freelance : simulateur multi-statuts + cockpit du réel, un seul moteur
de calcul. Voir `BRIEF.md` pour le périmètre et `CLAUDE.md` pour les règles de travail.

> Estimations uniquement. Ne constitue pas un conseil fiscal ou comptable.

## Structure

| Chemin            | Rôle                                        |
| ----------------- | ------------------------------------------- |
| `packages/engine` | Moteur de calcul pur (navigateur + serveur) |
| `packages/shared` | Types et schémas zod partagés               |
| `apps/api`        | API Hono + Drizzle (Postgres)               |
| `apps/web`        | SPA React + Vite                            |
| `db/migrations`   | Migrations SQL versionnées                  |
| `infra`           | Docker Compose, Dockerfiles, nginx          |

## Démarrer

```sh
pnpm install
pnpm dev
```

Stack complète (Postgres + API + nginx), avec `AUTH_MODE=none` dans `infra/.env` pour le
développement local :

```sh
cd infra
cp .env.example .env   # renseigner POSTGRES_PASSWORD
docker compose up -d --build --wait
curl http://127.0.0.1:8380/api/health
```

Déploiement (tunnel Cloudflare, Access, sauvegardes chiffrées, restauration) :
[`infra/README.md`](infra/README.md).

## Pages

| Route         | Contenu                                                                |
| ------------- | ---------------------------------------------------------------------- |
| `/cockpit`    | Solde disponible, couverture, réalisé vs prévu, échéancier, Acre       |
| `/saisie`     | Mouvements, factures, échéances                                        |
| `/simulateur` | Net par statut, comparaison, taux sourcés                              |
| `/reglages`   | Réglages datés, prévisionnel (calendrier de congés), solde bancaire    |
| `/demo`       | Cockpit sur données fictives, calculé dans le navigateur (`VITE_DEMO`) |
