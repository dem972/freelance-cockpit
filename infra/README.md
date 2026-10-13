# Deployment

Docker runs on a machine you own. The only way in from outside is a Cloudflare Tunnel
(`cloudflared` dials out to Cloudflare, no inbound port) protected by Cloudflare Access. The API
verifies the Access JWT itself: without a valid token, no data leaves.

```
browser ─▶ Cloudflare Access ─▶ tunnel ─▶ cloudflared ─▶ web:8080 (nginx) ─▶ api:3000 ─▶ db
                                                          └▶ agent:8000 ─▶ OpenAI (optional)
                                                       backup ─▶ remote bucket
```

| Network        | Services                                       | Internet access |
| -------------- | ---------------------------------------------- | --------------- |
| `backend`      | db, api, web, redis, agent*, backup            | no (internal)   |
| `edge`         | web, cloudflared                               | yes             |
| `egress`       | backup                                         | yes             |
| `agent-egress` | agent, agent-worker (OpenAI, official sources) | yes             |

## 1. Prepare `infra/.env`

```sh
cp infra/.env.example infra/.env && chmod 600 infra/.env
```

Set `POSTGRES_PASSWORD` (long, random), `AGENT_API_TOKEN` (`openssl rand -hex 32`), then the
sections below. The file is git-ignored; never copy it into an image.

## 2. Cloudflare Tunnel

1. Zero Trust → Networks → Tunnels → **Create a tunnel** (cloudflared), name `finance-cockpit`.
   Copy the **token** to `CLOUDFLARE_TUNNEL_TOKEN`.
2. **Public hostname** tab: `cockpit.<your-domain>` → service `HTTP` → `web:8080`.

## 3. Cloudflare Access

1. Zero Trust → Access → Applications → **Add an application** → Self-hosted, domain
   `cockpit.<your-domain>`.
2. **Allow** policy, rule _Emails_ = your address (One-time PIN or your SSO).
3. Copy the application's **Application Audience (AUD) Tag** → `CF_ACCESS_AUD`.
4. `CF_ACCESS_TEAM_DOMAIN` = `<team>.cloudflareaccess.com`; `ALLOWED_EMAILS` = your address(es),
   comma-separated; `AUTH_MODE=access`.

The API checks the RS256 signature against `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`,
the issuer, audience, expiry, then the email against `ALLOWED_EMAILS`. Only `/api/health` stays
open (no data, used by the healthcheck). With `AUTH_MODE=access`, the local URL
`127.0.0.1:8380` shows the UI but the API answers 401: everything goes through Access.

## 4. Backups

Encrypted with [age](https://age-encryption.org) to a **public key**: the private key never
lives on the server, so a stolen disk or bucket reveals nothing.

1. On your laptop (not the server): `age-keygen -o finance-cockpit-age.key`. Keep that file
   offline (password manager + paper / USB copy).
2. Copy the `Public key: age1...` line to `AGE_RECIPIENT`.
3. An S3-compatible bucket (R2, B2, Scaleway…) with a key restricted to it:
   `RCLONE_REMOTE=remote:<bucket>/finance-cockpit`, `S3_*`.
4. `BACKUP_AT` (local time, `TZ`), retention `KEEP_DAYS` (local and remote).

Every night: `pg_dump -Fc | age -r $AGE_RECIPIENT` → `backups` volume + rclone upload. A failed
upload fails the backup (visible in `docker compose logs backup`).

## 5. Agents (copilot, reports, rates watch)

- `AGENT_API_TOKEN`: internal agent → API secret. nginx strips `Authorization` from public
  requests, so only internal containers can present it.
- `OPENAI_API_KEY`: optional. Without it the app works; the copilot says it is disabled, reports
  use the figures-only template and the rates watch only checks pages and `modele-social`.
- `OPENAI_MODEL`, `OPENAI_MODEL_FAST`, `OPENAI_EMBEDDING_MODEL`, `RATES_WATCH_CRON`.
- Data sent to OpenAI (the figures and labels a question needs) is subject to their API data
  retention policy.
- Upgrading from `postgres:16-alpine` to `pgvector/pgvector:0.8.6-pg16` (musl → glibc collation):
  after the first start on an existing volume, run
  `docker compose exec db psql -U cockpit -d cockpit -c "REINDEX DATABASE cockpit;"`.

## 6. Source link (AGPL)

Set `SOURCE_URL` to the repository you deploy from (your fork if you changed anything): the
footer links to it, as AGPL-3.0 §13 requires for network use.

## 7. Start

```sh
cd infra
docker compose --profile prod up -d --build --wait
docker compose --profile prod ps
docker compose --profile prod run --rm backup once   # first backup right away
```

Without `--profile prod`, cloudflared and backup do not start (local development; `AUTH_MODE=none`
is possible and the API logs a warning).

## 8. Restore

**Restore test** (monthly, and after any infrastructure change): fresh backup, restore into a
throwaway Postgres, table-by-table row count comparison.

```sh
infra/backup/test-restore.sh ~/path/finance-cockpit-age.key
```

**Real restore** (overwrites the database):

```sh
cd infra
docker compose stop api
# from the latest local copy
docker compose --profile prod run --rm -v ~/finance-cockpit-age.key:/run/age-identity:ro \
  --entrypoint /usr/local/bin/restore.sh backup latest /run/age-identity
# or from the bucket (new machine)
docker compose --profile prod run --rm -v ~/finance-cockpit-age.key:/run/age-identity:ro \
  --entrypoint /usr/local/bin/restore.sh backup remote:<bucket>/finance-cockpit/<file>.dump.age /run/age-identity
docker compose start api
```

On macOS with Docker Desktop, the key must be in a folder shared with Docker (your home folder is
by default, `/tmp` is not).

## Security summary

- No inbound port; web published on `127.0.0.1` only.
- db, api and redis without internet access (`internal` network).
- Access JWT verified by the API and the agent service (signature, audience, issuer, expiry,
  email).
- Non-root images: api (`node`), web (`nginx-unprivileged`), agent (`agent`), backup
  (`postgres`), cloudflared (`nonroot`); read-only filesystems where possible.
- Pinned versions: exact image tags, lockfiles (`pnpm install --frozen-lockfile`, `uv sync
--frozen`), two-week cooldown on new releases.
- Secrets only in `infra/.env` (git-ignored); backup private key off the server.
