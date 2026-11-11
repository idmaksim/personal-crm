#!/usr/bin/env bash
#
# Deploy one image to the server. Run on the server (the workflow copies the
# deploy/ folder here and calls this script):
#
#   bash ~/deploy/deploy.sh ghcr.io/<owner>/<repo>:<sha>            # production
#   bash ~/deploy/deploy.sh ghcr.io/<owner>/<repo>:<sha> staging   # test stand
#
# One script, two environments. The second argument selects the environment
# (default "prod"). It only changes a handful of values (compose project name,
# container names, port, env file, whether to back up, whether to reseed from
# prod, memory limits); the steps are the same.
#
# prod:    pull image -> start DB -> back up the database -> run migrations
#          (one-shot) -> start app -> smoke test /health -> clean up.
# staging: pull image -> start DB -> reseed DB from prod (copy prod's data) ->
#          run migrations -> start app -> smoke test /health -> clean up.
#          The stand makes NO backup (its data is disposable) and is skipped
#          entirely when it is not configured yet (no .env.staging on the server).
#
# If a backup, reseed, migrations or the smoke test fail, the script exits
# non-zero and does NOT roll back (rollback is manual).
set -euo pipefail

IMAGE="${1:?usage: deploy.sh <image-ref> [prod|staging]}"
ENV_NAME="${2:-prod}"

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DEPLOY_DIR"

# --- Per-environment configuration -------------------------------------------
# Defaults below reproduce production exactly. Staging overrides just what it
# needs. These names must match the defaults baked into docker-compose.prod.yml.
case "$ENV_NAME" in
  prod)
    PROJECT="prod"
    export APP_CONTAINER="prod-app"
    export DB_CONTAINER="prod-postgres"
    export APP_PORT="3000"
    export ENV_FILE=".env"
    export APP_MEM_LIMIT="0"   # 0 = no limit
    export DB_MEM_LIMIT="0"
    DO_BACKUP=1
    DO_RESEED=0
    ;;
  staging)
    PROJECT="test"
    export APP_CONTAINER="test-app"
    export DB_CONTAINER="test-postgres"
    export APP_PORT="3100"
    export ENV_FILE=".env.staging"
    export APP_MEM_LIMIT="536870912"   # 512 MiB
    export DB_MEM_LIMIT="402653184"    # 384 MiB
    DO_BACKUP=0
    DO_RESEED=1
    # The stand copies prod's data; this is the container it reads from.
    PROD_DB_CONTAINER="prod-postgres"
    ;;
  *)
    echo "ERROR: unknown environment '$ENV_NAME' (expected: prod | staging)" >&2
    exit 1
    ;;
esac

# The env file holds secrets and is created on the server by hand (not in git).
# Production must have it. The stand is opt-in: with no .env.staging yet, skip
# cleanly (exit 0) so a merge to main does not fail on an unconfigured stand.
if [ ! -f "$ENV_FILE" ]; then
  if [ "$ENV_NAME" = "staging" ]; then
    echo "==> Test stand is not configured ($DEPLOY_DIR/$ENV_FILE is missing) — skipping."
    exit 0
  fi
  echo "ERROR: $DEPLOY_DIR/$ENV_FILE not found. Create it first." >&2
  exit 1
fi

export APP_IMAGE="$IMAGE"
COMPOSE=(docker compose -p "$PROJECT" -f docker-compose.prod.yml)

BACKUP_DIR="$DEPLOY_DIR/backups"
BACKUPS_TO_KEEP=10

# Read PUBLIC_APP_URL from the env file for the public smoke test below. We grep
# just this one key instead of sourcing the file, since it also holds secrets
# whose values are not safe to eval as shell.
PUBLIC_APP_URL="$(grep -E '^PUBLIC_APP_URL=' "$ENV_FILE" | tail -n1 | cut -d= -f2- | tr -d '\r')"

echo "==> Deploying environment: $ENV_NAME (project $PROJECT, port $APP_PORT)"
echo "==> Pulling image: $IMAGE"
"${COMPOSE[@]}" pull app

echo "==> Starting database"
"${COMPOSE[@]}" up -d postgres

# Wait until Postgres is actually accepting connections before we touch it. The
# compose healthcheck already does this for the app, but the backup/reseed below
# talk to the container directly, so we wait here too.
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

# Back up the database BEFORE migrations touch it (production only). The backup
# file is named after the app version running right now (before this deploy), so
# each backup is tied to the release it was taken from. On the very first deploy
# there is no running app yet, so we record the version as "none".
if [ "$DO_BACKUP" = "1" ]; then
  echo "==> Backing up the database (before migrations)"
  PREV_VERSION="$(docker inspect --format '{{.Config.Image}}' "$APP_CONTAINER" 2>/dev/null | sed 's#.*:##' || true)"
  if [ -z "$PREV_VERSION" ]; then PREV_VERSION="none"; fi
  mkdir -p "$BACKUP_DIR"
  BACKUP_FILE="$BACKUP_DIR/backup_$(date +%Y%m%d-%H%M%S)_${PREV_VERSION}.dump"
  # Dump from inside the container, reading DB credentials from the container's
  # own environment, so this script never has to read secrets from the env file.
  # -Fc = custom format: compressed and restored cleanly by pg_restore.
  if ! docker exec "$DB_CONTAINER" sh -c \
      'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$BACKUP_FILE"; then
    echo "BACKUP FAILED — aborting deploy before migrations run." >&2
    rm -f "$BACKUP_FILE"
    exit 1
  fi
  echo "    Saved backup: $BACKUP_FILE"
fi

# Reseed the stand's database from prod (staging only). We stream a consistent
# prod dump straight into the stand's database, recreating objects as we go, so
# the stand always starts from a fresh copy of prod. --no-owner because the
# stand has its own database role; both sides read their own credentials from
# the container environment, so no secret is read from a file here.
if [ "$DO_RESEED" = "1" ]; then
  echo "==> Reseeding the stand database from prod ($PROD_DB_CONTAINER)"
  if ! docker exec "$PROD_DB_CONTAINER" sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null 2>&1; then
    echo "ERROR: prod database ($PROD_DB_CONTAINER) is not reachable; cannot reseed the stand." >&2
    exit 1
  fi
  if ! docker exec "$PROD_DB_CONTAINER" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
      | docker exec -i "$DB_CONTAINER" sh -c \
          'pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"'; then
    echo "RESEED FAILED — aborting stand deploy before migrations run." >&2
    exit 1
  fi
  echo "    Stand database now holds a copy of prod"
fi

echo "==> Applying migrations (one-shot; deploy aborts if this fails)"
"${COMPOSE[@]}" run --rm migrate

echo "==> Starting app with the new image"
"${COMPOSE[@]}" up -d app

echo "==> Smoke test: GET 127.0.0.1:$APP_PORT/health (expect 200)"
ok=""
code=""
for i in $(seq 1 30); do
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$APP_PORT/health" || true)"
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
# This catches an nginx misconfig (e.g. the domain serving the landing page
# instead of the CRM) that the local 127.0.0.1 test cannot see. On the stand,
# /health is exempt from the basic-auth password so this still works.
# Set PUBLIC_APP_URL in the env file to enable it (e.g. https://app.dobrymaxx.ru).
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
    echo "Likely an nginx issue — compare the server config with the matching" >&2
    echo "file in deploy/nginx/. Rollback is manual." >&2
    exit 1
  fi
  echo "    $PUBLIC_APP_URL/health returned ok — CRM is reachable from outside"
else
  echo "==> Public smoke test skipped (PUBLIC_APP_URL not set in $ENV_FILE)"
fi

echo "==> Cleaning up old images (keep the 2 newest of this repo)"
REPO="${IMAGE%:*}"
docker images "$REPO" --format '{{.CreatedAt}}|{{.ID}}' \
  | sort -r \
  | awk -F'|' 'NR>2 {print $2}' \
  | sort -u \
  | xargs -r docker rmi -f 2>/dev/null || true
docker image prune -f >/dev/null 2>&1 || true

# Backups exist only for production; nothing to prune on the stand.
if [ "$DO_BACKUP" = "1" ]; then
  echo "==> Cleaning up old backups (keep the $BACKUPS_TO_KEEP newest)"
  # List backups newest-first by name (the timestamp prefix sorts chronologically)
  # and delete everything past the first $BACKUPS_TO_KEEP.
  ls -1t "$BACKUP_DIR"/backup_*.dump 2>/dev/null \
    | tail -n "+$((BACKUPS_TO_KEEP + 1))" \
    | xargs -r rm -f
fi

echo "==> Deploy complete: $IMAGE ($ENV_NAME)"
