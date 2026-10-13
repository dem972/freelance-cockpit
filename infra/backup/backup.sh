#!/bin/sh
# Daily encrypted pg_dump, kept locally and copied to a remote bucket.
#   backup.sh        run forever, once a day at $BACKUP_AT (container mode)
#   backup.sh once   run a single backup now
set -eu
set -o pipefail

: "${PGHOST:?}" "${PGUSER:?}" "${PGDATABASE:?}" "${PGPASSWORD:?}"
: "${AGE_RECIPIENT:?set AGE_RECIPIENT to the age public key (age1...)}"
BACKUP_DIR=${BACKUP_DIR:-/backups}
RCLONE_REMOTE=${RCLONE_REMOTE:-}
KEEP_DAYS=${KEEP_DAYS:-30}
BACKUP_AT=${BACKUP_AT:-03:00}

run_once() {
  ts=$(date -u +%Y%m%dT%H%M%SZ)
  file="$BACKUP_DIR/cockpit-$ts.dump.age"
  pg_dump --format=custom --no-owner --no-privileges | age --encrypt -r "$AGE_RECIPIENT" > "$file.partial"
  mv "$file.partial" "$file"
  echo "backup written: $file ($(wc -c < "$file") bytes)"
  if [ -n "$RCLONE_REMOTE" ]; then
    rclone copy --no-traverse "$file" "$RCLONE_REMOTE"
    rclone delete --min-age "${KEEP_DAYS}d" --include 'cockpit-*.dump.age' "$RCLONE_REMOTE"
    echo "backup uploaded to $RCLONE_REMOTE"
  else
    echo "WARNING: RCLONE_REMOTE not set, backup kept on this machine only" >&2
  fi
  find "$BACKUP_DIR" -name 'cockpit-*.dump.age' -mtime +"$KEEP_DAYS" -delete
}

if [ "${1:-}" = "once" ]; then
  run_once
  exit 0
fi

while true; do
  now=$(date +%s)
  target=$(date -d "$BACKUP_AT" +%s)
  [ "$target" -le "$now" ] && target=$((target + 86400))
  echo "next backup at $(date -d "@$target")"
  sleep $((target - now))
  run_once || echo "BACKUP FAILED at $(date)" >&2
done
