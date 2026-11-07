#!/usr/bin/env bash
#
# Restore the production database from a backup file. Run on the server BY HAND
# (never automatically, never from the deploy workflow):
#
#   bash ~/deploy/restore.sh ~/deploy/backups/backup_<...>.dump
#
# What it does, in order:
#   1. Shows which file it will load and which database it will replace, then
#      waits for you to type "yes". Anything else aborts and changes nothing.
#   2. Takes a safety copy of the CURRENT database first (pre-restore_*.dump).
#   3. Stops the prod app.
#   4. Drops the database, recreates it empty, and loads the backup into it.
#   5. Starts the app again on the SAME version it was running — this script
#      never changes the app version.
#
# Backups are in custom format (pg_dump -Fc), created by deploy.sh.
set -euo pipefail

BACKUP_FILE="${1:?usage: restore.sh <backup-file>}"

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DEPLOY_DIR"

if [ ! -f .env ]; then
  echo "ERROR: $DEPLOY_DIR/.env not found." >&2
  exit 1
fi
if [ ! -f "$BACKUP_FILE" ]; then
  echo "ERROR: backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

BACKUP_DIR="$DEPLOY_DIR/backups"
DB_CONTAINER="prod-postgres"
COMPOSE=(docker compose -p prod -f docker-compose.prod.yml)

# Make sure the database container is up (we restore through it). This does not
# touch the app.
"${COMPOSE[@]}" up -d postgres >/dev/null
echo "==> Waiting for the database to be ready"
db_ready=""
for i in $(seq 1 30); do
  if docker exec "$DB_CONTAINER" sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null 2>&1; then
    db_ready=1; break
  fi
  sleep 2
done
if [ "$db_ready" != "1" ]; then
  echo "ERROR: database did not become ready in time; aborting." >&2
  exit 1
fi

# Read the target database name and role from the container's own environment,
# so this script never has to read secrets from .env. (The password is not
# needed: inside the container psql/pg_dump connect over the local socket, which
# the official postgres image trusts.)
DB_NAME="$(docker exec "$DB_CONTAINER" printenv POSTGRES_DB | tr -d '\r')"
DB_USER="$(docker exec "$DB_CONTAINER" printenv POSTGRES_USER | tr -d '\r')"

# --- Confirmation -----------------------------------------------------------
echo
echo "This will REPLACE the production database."
echo "  Backup file : $BACKUP_FILE"
echo "  Database    : $DB_NAME  (on container $DB_CONTAINER)"
echo "The current contents of '$DB_NAME' will be dropped and replaced."
echo "A safety copy of the current database will be taken first."
echo
printf 'Type "yes" to continue: '
read -r answer
if [ "$answer" != "yes" ]; then
  echo "Aborted — nothing was changed."
  exit 1
fi

# --- 1. Safety copy of the current database ---------------------------------
echo "==> Taking a safety copy of the current database"
mkdir -p "$BACKUP_DIR"
SAFETY_FILE="$BACKUP_DIR/pre-restore_$(date +%Y%m%d-%H%M%S).dump"
if ! docker exec "$DB_CONTAINER" sh -c \
    'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$SAFETY_FILE"; then
  echo "ERROR: could not take a safety copy; aborting without changing anything." >&2
  rm -f "$SAFETY_FILE"
  exit 1
fi
echo "    Safety copy saved: $SAFETY_FILE"

# --- 2. Stop the app --------------------------------------------------------
echo "==> Stopping the app"
"${COMPOSE[@]}" stop app >/dev/null

# --- 3. Drop + recreate an empty database -----------------------------------
# Connect to the maintenance "postgres" database to drop/create the target.
# Terminate any leftover connections first, or DROP DATABASE would fail. The
# names below are shell variables we read above, not secrets.
echo "==> Recreating an empty database '$DB_NAME'"
docker exec "$DB_CONTAINER" psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d postgres \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();" >/dev/null
docker exec "$DB_CONTAINER" psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d postgres \
  -c "DROP DATABASE IF EXISTS \"$DB_NAME\";"
docker exec "$DB_CONTAINER" psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d postgres \
  -c "CREATE DATABASE \"$DB_NAME\" OWNER \"$DB_USER\";"

# --- 4. Load the backup -----------------------------------------------------
echo "==> Loading the backup into '$DB_NAME'"
if ! docker exec -i "$DB_CONTAINER" sh -c \
    'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --exit-on-error' < "$BACKUP_FILE"; then
  echo "RESTORE FAILED while loading the backup." >&2
  echo "The database '$DB_NAME' may be incomplete. The safety copy is at:" >&2
  echo "  $SAFETY_FILE" >&2
  echo "The app is still stopped. Fix the issue and re-run restore, or start the" >&2
  echo "app manually once the database is sound." >&2
  exit 1
fi

# --- 5. Start the app again on the same version -----------------------------
echo "==> Starting the app again (same version as before)"
"${COMPOSE[@]}" start app >/dev/null

echo "==> Restore complete. Database '$DB_NAME' restored from:"
echo "    $BACKUP_FILE"
echo "    Safety copy of the previous state: $SAFETY_FILE"
