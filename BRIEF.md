# Brief : Finance Cockpit (outil perso freelance)

> À lire en entier avant d'écrire du code. Ce fichier fait foi ; en cas de doute, poser la question
> plutôt que deviner.

## 1. Objectif

Outil **perso, mono-utilisateur**, qui remplace les tableurs Excel de suivi du net freelance.

Deux modes qui partagent **un seul moteur de calcul** :

1. **Simulateur** : part d'un TJM, de jours/mois, de frais pro, et donne le net par statut
   (Micro-BNC, EURL IS, EURL IR, SASU, portage). Barres « pour toi / cotisations / impôt / CFP »,
   comparaison des statuts, options avancées.
2. **Cockpit (réel)** : à partir des factures et des encaissements, affiche solde disponible
   (solde − provisions non payées), couverture des provisions avant la prochaine échéance, CA et net
   réalisés contre projetés, échéancier (URSSAF, TVA, impôt).

Différenciant : **chaque taux affiché est sourcé** (URSSAF / service-public / impots.gouv) avec date
de vérification, visible à côté du calcul.

## 2. Hors périmètre (v1)

- Multi-utilisateur, comptes, facturation de paiement.
- Import bancaire (CSV ou DSP2) : prévu plus tard derrière une interface `TransactionSource`.
- Déclaration fiscale automatique, conseil personnalisé. L'outil donne des **estimations**, avec un
  disclaimer visible.

## 3. Stack (décidée)

| Couche      | Choix                                                                  |
| ----------- | ---------------------------------------------------------------------- |
| Langage     | TypeScript partout                                                     |
| Monorepo    | pnpm workspaces                                                        |
| API         | Hono (Node)                                                            |
| Front       | React + Vite (SPA, pas de SSR)                                         |
| DB          | Postgres 16 + Drizzle, migrations SQL versionnées                      |
| Validation  | zod (schémas dans `packages/shared`)                                   |
| Tests       | Vitest                                                                 |
| Déploiement | Docker Compose + `cloudflared` (Cloudflare Tunnel) + Cloudflare Access |

Pourquoi TS : le moteur tourne **dans le navigateur** (simulateur instantané, mode démo sans backend)
**et** côté serveur (provisions du réel), avec le même code.

## 4. Structure du repo

```
finance-cockpit/
├─ packages/
│  ├─ engine/            # fonctions pures, zéro I/O
│  │  ├─ rates/2026.json # taux + source + date de vérification
│  │  └─ src/
│  └─ shared/            # types + schémas zod
├─ apps/
│  ├─ api/               # Hono, Drizzle, saisie manuelle
│  └─ web/               # simulateur + cockpit + mode démo
├─ db/migrations/
├─ infra/
│  ├─ docker-compose.yml
│  └─ Dockerfile.*
├─ BRIEF.md
└─ CLAUDE.md             # règles de travail (voir §10)
```

## 5. Moteur de calcul (`packages/engine`)

- **Fonctions pures** : `(entrée, statut, année, options) → ventilation`. Aucun accès réseau, disque
  ou date implicite (la date est un paramètre).
- **Montants en centimes (entiers)**, jamais de float. Arrondis explicites et documentés.
- **Barèmes en JSON versionné par année**. Chaque taux contient : `value`, `source_url`,
  `verified_on`, `note`. Le front affiche ces champs.
- **Ne jamais coder un taux de mémoire.** Aller chercher la valeur sur la source officielle, la
  sourcer dans le JSON, et signaler tout taux non vérifié.
- Statuts à couvrir, par ordre : Micro-BNC → EURL IR → EURL IS → SASU → portage salarial. Si un
  statut ne peut pas être modélisé de façon fiable, retourner une **fourchette** plutôt qu'une
  fausse précision.
- Options à prévoir dès le modèle : versement libératoire, ACRE (avec suivi du plafond de CA et du
  mois d'épuisement), franchise de TVA / assujettissement, frais pro, nombre de parts, caisse
  (régime général ou autre).
- **Réglages datés** (décision Q2) : chaque option ci-dessus est un réglage utilisateur modifiable à
  tout moment, avec une date d'effet (`valid_from`). Le moteur reçoit une **chronologie** de réglages
  et calcule mois par mois ; un changement en cours d'année (fin d'ACRE, passage à la TVA, option VL,
  changement de statut) s'applique à partir de sa date.
- Tests de non-régression sur des **cas de référence** issus des simulateurs officiels (URSSAF /
  mon-entreprise.urssaf.fr, impots.gouv), chaque cas daté et sourcé (décision Q5) + cas limites aux
  seuils (plafonds de CA, bascules de tranche).

## 6. Données (Postgres)

Montants en `bigint` centimes. Tables v1 :

- `invoices` (numéro unique, client, dates, `amount_ht`, `vat_amount`, `paid_on` ; en micro, c'est
  l'encaissement qui compte)
- `transactions` (date, libellé, montant signé, `source` = manual pour v1, `invoice_id` nullable)
- `provisions` (par transaction : `kind` ∈ urssaf, cfp, impot_vl, tva ; `amount` ; `rate_version`
  pour rejouer un calcul)
- `deadlines` (type, échéance, montant dû, date de paiement)
- `settings` (clé, valeur, `valid_from`) : historique des réglages de la §5

Vues pour le cockpit : `v_available_balance`, `v_coverage`, `v_ytd` (réalisé vs projeté).

## 7. Ingestion

- v1 : **saisie manuelle** (décision Q1) des factures, encaissements et dépenses via l'interface,
  validée par les schémas zod partagés.
- Plus tard : import CSV bancaire puis DSP2 (Powens ou Bridge, à vérifier au moment de s'y mettre),
  derrière une interface `TransactionSource`, avec déduplication par hash (`row_hash`).

## 8. Mode démo

- Calcul 100 % côté client, données fictives, **aucune écriture**.
- Pas de démo publique (décision Q4) : le mode démo est lui aussi derrière Cloudflare Access.
- Le mode démo et le mode réel sont séparés dès le départ (flag d'environnement + routes distinctes).

## 9. Déploiement et sécurité

- Docker tourne **en local** (décision Q3), exposé uniquement via Cloudflare Tunnel + Access.
- `docker-compose.yml` : services `api`, `web` (nginx statique non-root, port 8080), `db`,
  `cloudflared`, `backup`.
- Réseau interne uniquement ; seul `cloudflared` sort vers Cloudflare, tunnel vers `web:8080`. Le
  port web n'est publié que sur `127.0.0.1` pour l'accès local.
- Cloudflare Access devant le hostname (SSO ou one-time PIN limité à l'email de l'utilisateur).
  **Tout** passe derrière Access, simulateur compris.
- **L'API vérifie le JWT `Cf-Access-Jwt-Assertion`** (signature via les clés publiques du team
  domain + audience). Ne jamais se contenter de faire confiance au header.
- Secrets via Docker secrets ou `.env` hors repo, jamais dans l'image ni dans git. `.env.example`
  fourni.
- Sauvegarde `pg_dump` quotidienne chiffrée (age) vers un bucket distant (indispensable : la
  machine locale est le seul autre exemplaire) ; procédure de restauration testée et documentée.
- Les images tournent en utilisateur non-root, avec dépendances épinglées (lockfile commité).

## 10. Règles de travail (reprises dans `CLAUDE.md`)

- Petits commits, un jalon à la fois, tests verts avant de passer au suivant.
- Aucun taux ou seuil fiscal sans source officielle et date de vérification.
- Pas de dépendance ajoutée sans justification d'une ligne.
- Types stricts (`strict: true`), pas de `any`.
- Lint + format + typecheck + tests en CI (GitHub Actions) sur chaque PR.
- Documenter les hypothèses du moteur dans `packages/engine/README.md`.

## 11. Jalons

| #   | Jalon             | Critère de fin                                                                |
| --- | ----------------- | ----------------------------------------------------------------------------- |
| J0  | Scaffold          | Monorepo, CI, `docker compose up` démarre api + web + db                      |
| J1  | Moteur Micro-BNC  | Tests verts sur cas de référence, barème 2026 sourcé, réglages datés          |
| J2  | Simulateur web    | Écran TJM/jours/frais → net, barre de répartition, taux sourcés affichés      |
| J3  | Autres statuts    | EURL IR/IS, SASU, portage, avec fourchettes si besoin                         |
| J4  | DB + saisie       | Saisie manuelle factures/encaissements, provisions calculées par transaction  |
| J5  | Cockpit           | Solde disponible, cercle de couverture, CA/net réalisé vs projeté, échéancier |
| J6  | Calendrier + ACRE | Congés posés → net recalculé ; mois d'épuisement ACRE                         |
| J7  | Déploiement       | Tunnel Cloudflare + Access + vérif JWT + backups testés                       |

## 12. Décisions (questions ouvertes tranchées le 2026-10-13)

1. **Banque / format CSV** → pas d'import en v1 : saisie manuelle des entrées financières (§7).
2. **Statut et options de référence** → aucun figé : ce sont des réglages flexibles, modifiables au
   fil de l'année et des mois, donc datés (§5, table `settings`).
3. **Où tourne Docker** → en local, accessible via Cloudflare Tunnel + Access (§9).
4. **Simulateur public ?** → non, tout passe derrière Access (§8, §9).
5. **Jeu de cas réels** → pas de jeu fourni : cas de référence construits depuis les simulateurs
   officiels, datés et sourcés (§5).

## 13. Copilot / autopilot IA (décisions du 2026-10-13)

L'IA n'invente aucun chiffre : le moteur reste la seule source des montants, l'IA l'appelle comme
un outil, explique et propose. Toute écriture (saisie, réglage, taux) est confirmée par
l'utilisateur.

| Sujet           | Décision                                                                  |
| --------------- | ------------------------------------------------------------------------- |
| Langage agents  | Python (exception assumée au « TypeScript partout ») : LangGraph + Celery |
| Tâches          | Celery (worker + beat), broker Redis interne, résultats dans Postgres     |
| Base            | Postgres + pgvector (mémoire, sources officielles indexées)               |
| Modèles         | OpenAI, configurables (`OPENAI_MODEL`, `OPENAI_MODEL_FAST`, embeddings)   |
| Alertes         | Règles déterministes, affichées dans l'app (pas d'e-mail ni de push)      |
| Veille des taux | À la demande + hebdomadaire ; propositions sourcées à valider dans l'app  |

Jalons :

| #   | Jalon                 | Critère de fin                                                                     |
| --- | --------------------- | ---------------------------------------------------------------------------------- |
| J8  | Alertes               | Couverture, échéances, seuils TVA/micro, fin d'Acre ; fil d'alertes dans l'app     |
| J9  | Copilot               | Service agent (FastAPI + Celery), chat avec outils, écritures confirmées           |
| J10 | Rapports + optimiseur | Optimiseur déterministe (moteur), rapport mensuel rédigé, à la demande et planifié |
| J11 | Veille des taux       | Hebdo + à la demande, extraits sourcés indexés (pgvector), propositions à valider  |
