# Déploiement

Docker tourne sur une machine locale. Le seul accès depuis l'extérieur passe par un tunnel
Cloudflare (`cloudflared` sort vers Cloudflare, aucun port entrant) protégé par Cloudflare Access.
L'API vérifie elle-même le JWT d'Access : sans jeton valide, aucune donnée ne sort.

```
navigateur ─▶ Cloudflare Access ─▶ tunnel ─▶ cloudflared ─▶ web:8080 (nginx) ─▶ api:3000 ─▶ db
                                                                  backup ─▶ bucket distant
```

| Réseau    | Services             | Sortie internet |
| --------- | -------------------- | --------------- |
| `backend` | db, api, web, backup | non (internal)  |
| `edge`    | web, cloudflared     | oui             |
| `egress`  | backup               | oui             |

## 1. Préparer `infra/.env`

```sh
cp infra/.env.example infra/.env && chmod 600 infra/.env
```

Renseigner `POSTGRES_PASSWORD` (long, aléatoire), puis les sections ci-dessous. Le fichier est
ignoré par git ; ne jamais le copier dans une image.

## 2. Tunnel Cloudflare

1. Zero Trust → Networks → Tunnels → **Create a tunnel** (type cloudflared), nom
   `finance-cockpit`. Copier le **token** dans `CLOUDFLARE_TUNNEL_TOKEN`.
2. Onglet **Public hostname** : `cockpit.<ton-domaine>` → service `HTTP` → `web:8080`.

## 3. Cloudflare Access

1. Zero Trust → Access → Applications → **Add an application** → Self-hosted, domaine
   `cockpit.<ton-domaine>`.
2. Politique **Allow**, règle _Emails_ = ton adresse (méthode : One-time PIN ou ton SSO).
3. Dans l'application, copier l'**Application Audience (AUD) Tag** → `CF_ACCESS_AUD`.
4. `CF_ACCESS_TEAM_DOMAIN` = `<team>.cloudflareaccess.com` ; `ALLOWED_EMAILS` = ta ou tes
   adresses, séparées par des virgules ; `AUTH_MODE=access`.

L'API vérifie : signature RS256 avec les clés de `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`,
émetteur, audience, expiration, puis l'email dans `ALLOWED_EMAILS`. Seul `/api/health` reste
ouvert (aucune donnée, utilisé par le healthcheck). Avec `AUTH_MODE=access`, l'URL locale
`127.0.0.1:8380` affiche l'interface mais l'API y répond 401 : tout passe par Access.

## 4. Sauvegardes

Chiffrées avec [age](https://age-encryption.org) vers une **clé publique** : la clé privée ne
vit jamais sur le serveur, un vol du disque ou du bucket ne donne rien de lisible.

1. Sur ton poste (pas sur le serveur) : `age-keygen -o finance-cockpit-age.key`. Garder ce
   fichier hors ligne (gestionnaire de mots de passe + copie papier/clé USB).
2. Copier la ligne `Public key: age1...` dans `AGE_RECIPIENT`.
3. Bucket S3-compatible (R2, B2, Scaleway…) avec une clé limitée à ce bucket :
   `RCLONE_REMOTE=remote:<bucket>/finance-cockpit`, `S3_*`.
4. `BACKUP_AT` (heure locale, `TZ`), rétention `KEEP_DAYS` (locale et distante).

Chaque nuit : `pg_dump -Fc | age -r $AGE_RECIPIENT` → volume `backups` + upload rclone. Un
échec d'upload fait échouer la sauvegarde (visible dans `docker compose logs backup`).

## 5. Démarrer

```sh
cd infra
docker compose --profile prod up -d --build --wait
docker compose --profile prod ps
docker compose --profile prod run --rm backup once   # première sauvegarde tout de suite
```

Sans `--profile prod`, seuls db, api et web démarrent (développement local, `AUTH_MODE=none`
possible ; l'API l'annonce dans ses logs).

## 6. Restaurer

**Test de restauration** (mensuel, et après toute modification de l'infra) : sauvegarde
fraîche, restauration dans un Postgres jetable, comparaison table par table.

```sh
infra/backup/test-restore.sh ~/chemin/finance-cockpit-age.key
```

Vérifié le 13/10/2026 avec un bucket S3 de test : `RESTORE TEST PASSED`, et restauration
directe depuis le bucket (cas où le disque local est perdu).

**Restauration réelle** (la base est écrasée) :

```sh
cd infra
docker compose stop api
# depuis la copie locale la plus récente
docker compose --profile prod run --rm -v ~/finance-cockpit-age.key:/run/age-identity:ro \
  --entrypoint /usr/local/bin/restore.sh backup latest /run/age-identity
# ou depuis le bucket (machine neuve)
docker compose --profile prod run --rm -v ~/finance-cockpit-age.key:/run/age-identity:ro \
  --entrypoint /usr/local/bin/restore.sh backup remote:<bucket>/finance-cockpit/<fichier>.dump.age /run/age-identity
docker compose start api
```

Sur macOS avec Docker Desktop, la clé doit être dans un dossier partagé avec Docker (ton
répertoire utilisateur l'est par défaut, `/tmp` non).

## Sécurité : récapitulatif

- Aucun port entrant ; web publié sur `127.0.0.1` seulement.
- db et api sans accès internet (réseau `internal`).
- JWT Access vérifié par l'API (signature, audience, émetteur, expiration, email).
- Images non-root : api (`node`), web (`nginx-unprivileged`), backup (`postgres`),
  cloudflared (`nonroot`) ; api et cloudflared en système de fichiers en lecture seule.
- Versions épinglées : images par tag exact, dépendances par lockfile (`pnpm install --frozen-lockfile`).
- Secrets uniquement dans `infra/.env` (git-ignoré) ; clé privée de sauvegarde hors serveur.
