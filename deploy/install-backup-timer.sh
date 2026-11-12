#!/usr/bin/env bash
#
# Install (or refresh) the systemd timer that backs up the production database
# once a day. Run on the server:
#
#   bash ~/deploy/install-backup-timer.sh
#
# The "Deploy prod" workflow runs this automatically after every prod deploy, so
# the timer is installed on the first prod deploy and kept in sync with the unit
# files in the repo after that. Safe to run repeatedly (idempotent).
#
# Needs sudo to write units into /etc/systemd/system (the deploy user has
# passwordless sudo). It only ADDS files that belong to this project; it never
# touches anything else on the server.
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UNIT_SRC="$DEPLOY_DIR/systemd"
UNIT_DST="/etc/systemd/system"

for unit in crm-backup.service crm-backup.timer; do
  echo "==> Installing $unit -> $UNIT_DST/$unit"
  sudo install -m 0644 "$UNIT_SRC/$unit" "$UNIT_DST/$unit"
done

echo "==> Reloading systemd and enabling the timer"
sudo systemctl daemon-reload
sudo systemctl enable --now crm-backup.timer

echo "==> Done. Timer status:"
systemctl list-timers crm-backup.timer --no-pager || true
