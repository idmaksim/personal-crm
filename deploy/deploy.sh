#!/usr/bin/env bash
#
# Deploy to the server. Run on the server (the workflow copies the deploy/ folder
# here and calls this script):
#
#   bash ~/deploy/deploy.sh ghcr.io/<owner>/<repo>:<sha>            # production
#   bash ~/deploy/deploy.sh ghcr.io/<owner>/<repo>:<sha> staging   # test stand
#   bash ~/deploy/deploy.sh --rollback                             # roll prod back
#
# One script, three uses. The second argument of the normal form selects the
# environment (default "prod"). It only changes a handful of values (compose
# project name, container names, port, env file, whether to back up, whether to
# reseed from prod, memory limits); the steps are the same.
#
# prod:     pull image -> start DB -> back up the database -> run migrations
#           (one-shot) -> start app -> smoke test /health -> record versions ->
#           clean up.
# staging:  pull image -> start DB -> reseed DB from prod (copy prod's data) ->
#           run migrations -> start app -> smoke test /health -> clean up.
#           The stand makes NO backup (its data is disposable) and is skipped
#           entirely when it is not configured yet (no .env.staging on the server).
# rollback: (prod only) take the PREVIOUS prod image recorded on the server and
#           start the app on it. No backup, no migrations, no reseed — the
#           database is left exactly as it is (migrations are forward-only, so the
#           old app simply ignores columns it does not know). Smoke test, then
#           swap the current/previous version pointers.
#
# If a backup, reseed, migrations or the smoke test fail, the script exits
# non-zero and does NOT roll back automatically (rollback is a manual button).
set -euo pipefail

# --- Parse arguments ---------------------------------------------------------
ROLLBACK=0
if [ "${1:-}" = "--rollback" ]; then
  ROLLBACK=1
  ENV_NAME="prod"
  IMAGE=""
else
  IMAGE="${1:?usage: deploy.sh <image-ref> [prod|staging]  |  deploy.sh --rollback}"
  ENV_NAME="${2:-prod}"
fi

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DEPLOY_DIR"

if [ "$ROLLBACK" = "1" ] && [ "$ENV_NAME" != "prod" ]; then
  echo "ERROR: --rollback is only for prod." >&2
  exit 1
fi

# Where we remember which image is live on prod and which one was live before it.
# These files live next to .env and are NOT in the repo, so scp never overwrites
# them. They are what makes the "rollback" button work.
PROD_CURRENT_FILE="$DEPLOY_DIR/.prod-current"
PROD_PREVIOUS_FILE="$DEPLOY_DIR/.prod-previous"

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

# --- Rollback: resolve the image from the recorded previous prod version ------
if [ "$ROLLBACK" = "1" ]; then
  if [ ! -s "$PROD_PREVIOUS_FILE" ]; then
    echo "ERROR: no previous prod version recorded ($PROD_PREVIOUS_FILE is missing)." >&2
    echo "There is nothing to roll back to yet (it appears after the next normal deploy)." >&2
    exit 1
  fi
  IMAGE="$(tr -d '\r\n' < "$PROD_PREVIOUS_FILE")"
  echo "==> Rollback requested. Previous prod version: $IMAGE"
  if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
    echo "ERROR: the previous prod image is no longer on this server: $IMAGE" >&2
    echo "Deploy a known-good SHA from GitHub (Deploy prod with a SHA) instead." >&2
    exit 1
  fi
  # Rollback never touches the database.
  DO_BACKUP=0
  DO_RESEED=0
fi

# Remember what prod was running BEFORE this deploy, so we can record it as the
# "previous" version after a successful switch (prod only).
PROD_BEFORE=""
if [ "$ENV_NAME" = "prod" ]; then
  PROD_BEFORE="$(tr -d '\r\n' < "$PROD_CURRENT_FILE" 2>/dev/null || true)"
  if [ -z "$PROD_BEFORE" ]; then
    PROD_BEFORE="$(docker inspect --format '{{.Config.Image}}' "$APP_CONTAINER" 2>/dev/null || true)"
  fi
fi

export APP_IMAGE="$IMAGE"
COMPOSE=(docker compose -p "$PROJECT" -f docker-compose.prod.yml)

# Read PUBLIC_APP_URL from the env file for the public smoke test below. We grep
# just this one key instead of sourcing the file, since it also holds secrets
# whose values are not safe to eval as shell.
PUBLIC_APP_URL="$(grep -E '^PUBLIC_APP_URL=' "$ENV_FILE" | tail -n1 | cut -d= -f2- | tr -d '\r')"

echo "==> Deploying environment: $ENV_NAME (project $PROJECT, port $APP_PORT)"
if [ "$ROLLBACK" = "1" ]; then
  echo "==> Using local image (rollback), not pulling: $IMAGE"
else
  echo "==> Pulling image: $IMAGE"
  "${COMPOSE[@]}" pull app
fi

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

# Back up the database BEFORE migrations touch it (production only, not rollback).
# backup.sh names the file after the app version running right now, prunes old
# backups, and exits non-zero on failure — which aborts this deploy before
# migrations run. The stand (DO_BACKUP=0) is skipped: its data is disposable.
if [ "$DO_BACKUP" = "1" ]; then
  echo "==> Backing up the database (before migrations)"
  bash "$DEPLOY_DIR/backup.sh" predeploy
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

# Rollback leaves the database untouched (migrations are forward-only).
if [ "$ROLLBACK" = "1" ]; then
  echo "==> Rollback: skipping migrations (database is left as is)"
else
  echo "==> Applying migrations (one-shot; deploy aborts if this fails)"
  "${COMPOSE[@]}" run --rm migrate
fi

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

# --- Record prod version pointers (prod only) --------------------------------
# After a successful switch, remember the live image and the one before it, so
# the rollback button knows where to go back to.
if [ "$ENV_NAME" = "prod" ]; then
  if [ "$ROLLBACK" = "1" ]; then
    # We went back to IMAGE; the version we came from becomes "previous", so a
    # second rollback (or an empty-SHA deploy) can move the other way.
    printf '%s\n' "$IMAGE" > "$PROD_CURRENT_FILE"
    if [ -n "$PROD_BEFORE" ] && [ "$PROD_BEFORE" != "$IMAGE" ]; then
      printf '%s\n' "$PROD_BEFORE" > "$PROD_PREVIOUS_FILE"
    fi
  else
    if [ -n "$PROD_BEFORE" ] && [ "$PROD_BEFORE" != "$IMAGE" ]; then
      printf '%s\n' "$PROD_BEFORE" > "$PROD_PREVIOUS_FILE"
    fi
    printf '%s\n' "$IMAGE" > "$PROD_CURRENT_FILE"
  fi
  echo "==> Recorded prod version: current=$IMAGE, previous=$(tr -d '\r\n' < "$PROD_PREVIOUS_FILE" 2>/dev/null || echo none)"
fi

# --- Clean up old images -----------------------------------------------------
# Keep the images we must not lose — the current and previous prod versions and
# the current test-stand version — plus anything younger than 2 weeks; drop the
# rest of this repo's images. This keeps rollback possible while the disk stays
# tidy. (GHCR is pruned separately, by the Deploy stand workflow.)
echo "==> Cleaning up old images (keep current+previous prod, current stand, and anything < 2 weeks old)"
REPO="${IMAGE%:*}"
keep="$(
  {
    cat "$PROD_CURRENT_FILE" 2>/dev/null || true
    cat "$PROD_PREVIOUS_FILE" 2>/dev/null || true
    docker inspect --format '{{.Config.Image}}' prod-app 2>/dev/null || true
    docker inspect --format '{{.Config.Image}}' test-app 2>/dev/null || true
  } | tr -d '\r' | sed '/^$/d' | sort -u
)"
cutoff="$(date -u -d '14 days ago' +%s 2>/dev/null || date -u -v-14d +%s 2>/dev/null || echo 0)"
if [ "$cutoff" != "0" ]; then
  docker images "$REPO" --format '{{.ID}} {{.Repository}}:{{.Tag}}' | while read -r id ref; do
    if printf '%s\n' "$keep" | grep -qxF "$ref"; then continue; fi
    created="$(docker image inspect --format '{{.Created}}' "$id" 2>/dev/null || echo '')"
    [ -z "$created" ] && continue
    created_ts="$(date -u -d "$created" +%s 2>/dev/null || echo 0)"
    if [ "$created_ts" -gt 0 ] && [ "$created_ts" -lt "$cutoff" ]; then
      docker rmi -f "$id" >/dev/null 2>&1 || true
    fi
  done
fi
docker image prune -f >/dev/null 2>&1 || true

# Old backups are pruned by backup.sh (called above for prod); nothing to do here.

echo "==> Deploy complete: $IMAGE ($ENV_NAME)"
