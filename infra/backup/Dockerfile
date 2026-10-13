# syntax=docker/dockerfile:1
# pg_dump must match the server major version (16).
FROM postgres:16.10-alpine
# age: encryption to a public key (the private key never lives on the server).
# rclone: upload to any S3-compatible bucket.
RUN apk add --no-cache age rclone
COPY --chmod=755 infra/backup/backup.sh infra/backup/restore.sh /usr/local/bin/
RUN mkdir -p /backups && chown postgres:postgres /backups
USER postgres
WORKDIR /backups
ENTRYPOINT ["/usr/local/bin/backup.sh"]
