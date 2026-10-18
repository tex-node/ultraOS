#!/bin/bash
# Partner data-feed drain timer (streak v6, Prompt 1).
#
# Installs a systemd timer that calls GET /api/cron/drain-feeds every 30 seconds, so webhook deliveries
# happen even when no new scoring is being written (a subscriber coming back after an outage, a retry whose
# backoff has expired, a process restarted with rows still PENDING).
#
# Usage (as root, on the app host):
#   bash install-feed-drain-timer.sh /opt/ultraleagueos 4110 production
#   bash install-feed-drain-timer.sh /opt/ultraos-staging 4120 staging
#
# Requires CRON_SECRET in the app's env file. The script refuses to install without it rather than creating a
# timer that would 503 forever.
set -euo pipefail

APP_ROOT="${1:?usage: install-feed-drain-timer.sh <app-root> <port> <environment>}"
PORT="${2:?missing port}"
ENVIRONMENT="${3:?missing environment}"

ENV_FILE="$APP_ROOT/shared/web.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "missing $ENV_FILE" >&2
  exit 1
fi
SECRET=$(grep -m1 '^CRON_SECRET=' "$ENV_FILE" | cut -d= -f2- | tr -d '"' || true)
if [ -z "${SECRET:-}" ]; then
  echo "CRON_SECRET is not set in $ENV_FILE - add it first (openssl rand -hex 32)." >&2
  exit 2
fi

NAME="ultraos-feed-drain-${ENVIRONMENT}"
cat > "/etc/systemd/system/${NAME}.service" <<UNIT
[Unit]
Description=UltraLeagueOS partner data-feed drain (${ENVIRONMENT})
After=network.target

[Service]
Type=oneshot
WorkingDirectory=${APP_ROOT}
# --fail-with-body would print nothing useful here; -sS keeps the journal clean but keeps errors visible.
ExecStart=/usr/bin/curl -sS --max-time 25 -X GET -H "x-cron-secret: ${SECRET}" http://127.0.0.1:${PORT}/api/cron/drain-feeds
StandardOutput=journal
StandardError=journal
UNIT

cat > "/etc/systemd/system/${NAME}.timer" <<UNIT
[Unit]
Description=Run the partner data-feed drain every 30 seconds (${ENVIRONMENT})

[Timer]
OnBootSec=30s
OnUnitActiveSec=30s
AccuracySec=5s
Unit=${NAME}.service

[Install]
WantedBy=timers.target
UNIT

chmod 600 "/etc/systemd/system/${NAME}.service"
systemctl daemon-reload
systemctl enable --now "${NAME}.timer"
sleep 2
systemctl list-timers "${NAME}.timer" --no-pager || true
echo "installed ${NAME}.timer -> http://127.0.0.1:${PORT}/api/cron/drain-feeds"
