#!/bin/sh
# End-to-end restore test, to run from the host (monthly, and after any change):
#   1. takes a fresh backup of the live database,
#   2. restores it into a throwaway Postgres,
#   3. compares row counts table by table.
# Usage: infra/backup/test-restore.sh <path-to-age-private-key>
set -eu
cd "$(dirname "$0")/.."

identity=${1:?usage: test-restore.sh <path-to-age-private-key>}
[ -f "$identity" ] || { echo "identity file not found: $identity" >&2; exit 1; }
net=fc-restore-test
scratch=fc-restore-db

cleanup() { docker rm -f "$scratch" >/dev/null 2>&1 || true; docker network rm "$net" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

echo "== 1. fresh backup"
docker compose --profile prod run --rm backup once

echo "== 2. throwaway database"
docker network create --internal "$net" >/dev/null
docker run -d --name "$scratch" --network "$net" -e POSTGRES_PASSWORD=restore-test \
  -e POSTGRES_USER=cockpit -e POSTGRES_DB=cockpit postgres:16.10-alpine >/dev/null
until docker exec "$scratch" pg_isready -U cockpit -d cockpit >/dev/null 2>&1; do sleep 1; done

echo "== 3. restore latest backup"
docker run --rm --network "$net" \
  -v finance-cockpit_backups:/backups:ro \
  -v "$(cd "$(dirname "$identity")" && pwd)/$(basename "$identity"):/run/age-identity:ro" \
  -e PGHOST="$scratch" -e PGUSER=cockpit -e PGDATABASE=cockpit -e PGPASSWORD=restore-test \
  --entrypoint /usr/local/bin/restore.sh finance-cockpit-backup latest /run/age-identity

echo "== 4. compare row counts"
query="select string_agg(t || '=' || n, ' ' order by t) from (
  select 'balance_snapshots' t, count(*) n from balance_snapshots union all
  select 'deadlines', count(*) from deadlines union all
  select 'invoices', count(*) from invoices union all
  select 'projections', count(*) from projections union all
  select 'provisions', count(*) from provisions union all
  select 'settings_patches', count(*) from settings_patches union all
  select 'transactions', count(*) from transactions) x"
live=$(docker compose exec -T db psql -U cockpit -d cockpit -tAc "$query")
restored=$(docker exec "$scratch" psql -U cockpit -d cockpit -tAc "$query")
echo "live:     $live"
echo "restored: $restored"
if [ "$live" = "$restored" ]; then
  echo "RESTORE TEST PASSED"
else
  echo "RESTORE TEST FAILED" >&2
  exit 1
fi
