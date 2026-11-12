#!/usr/bin/env bash
#
# Back up the PRODUCTION database to a file on the server. Used in two places:
#
#   1. Once a day, by the systemd timer (deploy/systemd/crm-backup.timer), so the
#      database has a fresh backup even between rare manual prod deploys.
#   2. By deploy.sh, as the first step of a prod deploy — before migrations touch
#      the data.
#
# Run on the server:
#
#   bash ~/deploy/backup.sh
#
# What it does: dump the prod database (custom format, compressed) into
# ~/deploy/backups/backup_<date-time>_<version>.dump, then delete old backups,
# keeping the newest $BACKUPS_TO_KEEP. The version in the file name is the app
# image tag running RIGHT NOW, so each backup is tied to the release its data
# belongs to. On the very first run (no app yet) the version is recorded as "none".
#
# Backups are in custom format (pg_dump -Fc) and are restored by restore.sh.
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DEPLOY_DIR"

# Production settings (match the defaults in docker-compose.prod.yml and deploy.sh).
DB_CONTAINER="prod-postgres"
APP_CONTAINER="prod-app"
BACKUP_DIR="$DEPLOY_DIR/backups"
BACKUPS_TO_KEEP=14

# The database must be reachable. We talk to the container directly, reading its
# credentials from its own environment, so this script never reads any secret.
if ! docker exec "$DB_CONTAINER" sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null 2>&1; then
  echo "ERROR: production database ($DB_CONTAINER) is not reachable; cannot back up." >&2
  exit 1
fi

# Name the backup after the app version running right now.
VERSION="$(docker inspect --format '{{.Config.Image}}' "$APP_CONTAINER" 2>/dev/null | sed 's#.*:##' || true)"
if [ -z "$VERSION" ]; then VERSION="none"; fi

mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/backup_$(date +%Y%m%d-%H%M%S)_${VERSION}.dump"

echo "==> Backing up the production database -> $BACKUP_FILE"
# -Fc = custom format: compressed and restored cleanly by pg_restore.
if ! docker exec "$DB_CONTAINER" sh -c \
    'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$BACKUP_FILE"; then
  echo "BACKUP FAILED." >&2
  rm -f "$BACKUP_FILE"
  exit 1
fi
echo "    Saved backup: $BACKUP_FILE"

echo "==> Cleaning up old backups (keep the $BACKUPS_TO_KEEP newest)"
# List backups newest-first by name (the timestamp prefix sorts chronologically)
# and delete everything past the first $BACKUPS_TO_KEEP.
ls -1t "$BACKUP_DIR"/backup_*.dump 2>/dev/null \
  | tail -n "+$((BACKUPS_TO_KEEP + 1))" \
  | xargs -r rm -f

echo "==> Backup complete"
