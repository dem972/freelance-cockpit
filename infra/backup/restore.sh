#!/bin/sh
# Restores an encrypted dump into the database given by PG* variables.
#   restore.sh <file.dump.age|latest|remote:bucket/file> <age-identity-file>
# "latest" picks the newest dump in $BACKUP_DIR; "remote:..." downloads it first. The identity (private key)
# is mounted only for the restore; it is never stored on the server.
set -eu
set -o pipefail

: "${PGHOST:?}" "${PGUSER:?}" "${PGDATABASE:?}" "${PGPASSWORD:?}"
BACKUP_DIR=${BACKUP_DIR:-/backups}
file=${1:?usage: restore.sh <file.dump.age|latest> <age-identity-file>}
identity=${2:?usage: restore.sh <file.dump.age|latest> <age-identity-file>}

if [ "$file" = "latest" ]; then
  file=$(ls -1 "$BACKUP_DIR"/cockpit-*.dump.age | sort | tail -n 1)
elif [ "${file#remote:}" != "$file" ]; then
  # Disaster case: the local copies are gone, fetch from the bucket.
  echo "downloading $file"
  rclone copyto "$file" /tmp/restore.dump.age
  file=/tmp/restore.dump.age
fi
echo "restoring $file into $PGDATABASE@$PGHOST"
age --decrypt -i "$identity" "$file" | pg_restore --clean --if-exists --no-owner --no-privileges -d "$PGDATABASE"
echo "restore done"
