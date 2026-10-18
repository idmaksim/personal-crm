#!/usr/bin/env bash
#
# Deploy one image to the server. Run on the server (the workflow copies the
# deploy/ folder here and calls this script):
#
#   bash ~/deploy/deploy.sh ghcr.io/<owner>/<repo>:<sha>
#
# Steps: pull image -> start DB -> run migrations (one-shot) -> start app ->
# smoke test /health -> clean up old images. If migrations or the smoke test
# fail, the script exits non-zero and does NOT roll back (rollback is manual).
set -euo pipefail

IMAGE="${1:?usage: deploy.sh <image-ref>}"

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DEPLOY_DIR"

if [ ! -f .env ]; then
  echo "ERROR: $DEPLOY_DIR/.env not found. Create it first." >&2
  exit 1
fi

export APP_IMAGE="$IMAGE"
COMPOSE=(docker compose -p prod -f docker-compose.prod.yml)

echo "==> Pulling image: $IMAGE"
"${COMPOSE[@]}" pull app

echo "==> Starting database"
"${COMPOSE[@]}" up -d postgres

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

echo "==> Deploy complete: $IMAGE"
