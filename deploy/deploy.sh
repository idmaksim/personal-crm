#!/usr/bin/env bash
#
# Deploy one image to the server. Run on the server (the workflow copies the
# deploy/ folder here and calls this script):
#
#   bash ~/deploy/deploy.sh ghcr.io/<owner>/<repo>:<sha>
#
# Steps: pull image -> start DB -> back up the database -> run migrations
# (one-shot) -> start app -> smoke test /health -> clean up old images and
# backups. The backup is named after the app version that was running BEFORE
# this deploy, so you can see which release each backup belongs to. If the
# backup, migrations or the smoke test fail, the script exits non-zero and does
# NOT roll back (rollback is manual).
set -euo pipefail

IMAGE="${1:?usage: deploy.sh <image-ref>}"

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DEPLOY_DIR"

if [ ! -f .env ]; then
  echo "ERROR: $DEPLOY_DIR/.env not found. Create it first." >&2
  exit 1
fi

BACKUP_DIR="$DEPLOY_DIR/backups"
BACKUPS_TO_KEEP=10
DB_CONTAINER="prod-postgres"

export APP_IMAGE="$IMAGE"
COMPOSE=(docker compose -p prod -f docker-compose.prod.yml)

# Read PUBLIC_APP_URL from .env for the public smoke test below. We grep just
# this one key instead of sourcing .env, since .env also holds secrets whose
# values are not safe to eval as shell.
PUBLIC_APP_URL="$(grep -E '^PUBLIC_APP_URL=' .env | tail -n1 | cut -d= -f2- | tr -d '\r')"

echo "==> Pulling image: $IMAGE"
"${COMPOSE[@]}" pull app

echo "==> Starting database"
"${COMPOSE[@]}" up -d postgres

# Wait until Postgres is actually accepting connections before we dump it. The
# compose healthcheck already does this for the app, but the backup below talks
# to the container directly, so we wait here too.
echo "==> Waiting for the database to be ready"
db_ready=""
for i in $(seq 1 30); do
  if docker exec "$DB_CONTAINER" sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null 2>&1; then
    db_ready=1; break
  fi
  sleep 2
done
if [ "$db_ready" != "1" ]; then
  echo "ERROR: database did not become ready in time; aborting before backup." >&2
  exit 1
fi

# Back up the database BEFORE migrations touch it. The backup file is named
# after the app version that is running right now (before this deploy), so each
# backup is tied to the release it was taken from. On the very first deploy
# there is no running app yet, so we record the version as "none".
echo "==> Backing up the database (before migrations)"
PREV_VERSION="$(docker inspect --format '{{.Config.Image}}' prod-app 2>/dev/null | sed 's#.*:##' || true)"
if [ -z "$PREV_VERSION" ]; then PREV_VERSION="none"; fi
mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/backup_$(date +%Y%m%d-%H%M%S)_${PREV_VERSION}.dump"
# Dump from inside the container, reading DB credentials from the container's
# own environment, so this script never has to read secrets from .env.
# -Fc = custom format: compressed and restored cleanly by pg_restore.
if ! docker exec "$DB_CONTAINER" sh -c \
    'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$BACKUP_FILE"; then
  echo "BACKUP FAILED — aborting deploy before migrations run." >&2
  rm -f "$BACKUP_FILE"
  exit 1
fi
echo "    Saved backup: $BACKUP_FILE"

echo "==> Applying migrations (one-shot; deploy aborts if this fails)"
"${COMPOSE[@]}" run --rm migrate

echo "==> Starting app with the new image"
"${COMPOSE[@]}" up -d app

echo "==> Smoke test: GET /health (expect 200)"
ok=""
code=""
for i in $(seq 1 30); do
  code="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/health || true)"
  if [ "$code" = "200" ]; then ok=1; break; fi
  sleep 2
done
if [ "$ok" != "1" ]; then
  echo "SMOKE TEST FAILED (last HTTP code: ${code:-none})" >&2
  echo "--- last 50 lines of app log ---" >&2
  "${COMPOSE[@]}" logs --tail=50 app >&2 || true
  exit 1
fi
echo "    /health returned 200 — app is up"

# Public smoke test: hit the app through nginx/HTTPS, not just the container.
# This catches an nginx misconfig (e.g. app.dobrymaxx.ru serving the landing
# page instead of the CRM) that the local 127.0.0.1:3000 test cannot see.
# Set PUBLIC_APP_URL in ~/deploy/.env to enable it (e.g. https://app.dobrymaxx.ru).
if [ -n "${PUBLIC_APP_URL:-}" ]; then
  echo "==> Public smoke test: GET $PUBLIC_APP_URL/health (expect 200 + status ok)"
  pub_ok=""
  pub_code=""
  pub_body=""
  for i in $(seq 1 15); do
    pub_body="$(curl -fsS --max-time 10 "$PUBLIC_APP_URL/health" || true)"
    pub_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$PUBLIC_APP_URL/health" || true)"
    if [ "$pub_code" = "200" ] && printf '%s' "$pub_body" | grep -q '"status":"ok"'; then
      pub_ok=1; break
    fi
    sleep 2
  done
  if [ "$pub_ok" != "1" ]; then
    echo "PUBLIC SMOKE TEST FAILED (HTTP ${pub_code:-none}, body: ${pub_body:-empty})" >&2
    echo "The container is healthy but $PUBLIC_APP_URL does not serve the CRM." >&2
    echo "Likely an nginx issue — compare the server config with" >&2
    echo "deploy/nginx/app.dobrymaxx.ru.conf. Rollback is manual." >&2
    exit 1
  fi
  echo "    $PUBLIC_APP_URL/health returned ok — CRM is reachable from outside"
else
  echo "==> Public smoke test skipped (PUBLIC_APP_URL not set in .env)"
fi

echo "==> Cleaning up old images (keep the 2 newest of this repo)"
REPO="${IMAGE%:*}"
docker images "$REPO" --format '{{.CreatedAt}}|{{.ID}}' \
  | sort -r \
  | awk -F'|' 'NR>2 {print $2}' \
  | sort -u \
  | xargs -r docker rmi -f 2>/dev/null || true
docker image prune -f >/dev/null 2>&1 || true

echo "==> Cleaning up old backups (keep the $BACKUPS_TO_KEEP newest)"
# List backups newest-first by name (the timestamp prefix sorts chronologically)
# and delete everything past the first $BACKUPS_TO_KEEP.
ls -1t "$BACKUP_DIR"/backup_*.dump 2>/dev/null \
  | tail -n "+$((BACKUPS_TO_KEEP + 1))" \
  | xargs -r rm -f

echo "==> Deploy complete: $IMAGE"
