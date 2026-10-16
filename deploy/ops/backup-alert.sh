#!/usr/bin/env bash
# deploy/ops/backup-alert.sh
#
# Sends a backup failure / freshness email using Resend (the provider the
# Raivstream app already uses — RESEND_API_KEY lives in the server env, never
# in git). Used by backup-alert@.service (OnFailure=) and the 09:00 freshness
# check.
#
# Usage: backup-alert.sh <subject> [unit-or-empty]
#   with a unit name it appends the last 30 journal lines.
set -euo pipefail

SUBJECT="${1:?subject required}"
UNIT="${2:-}"

ENV_FILE="${BACKUP_ALERT_ENV:-/root/raivstream/.env}"
if [ -f "$ENV_FILE" ]; then
  RESEND_API_KEY="${RESEND_API_KEY:-$(grep -oE '^RESEND_API_KEY=.*' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '"')}"
fi

: "${RESEND_API_KEY:?RESEND_API_KEY not found (set it or BACKUP_ALERT_ENV)}"
TO="${BACKUP_ALERT_TO:-texdevices@gmail.com}"
FROM="${BACKUP_ALERT_FROM:-Raivstream Backups <onboarding@resend.dev>}"

BODY="Host: $(hostname)
Time: $(date -Is)
Subject: ${SUBJECT}
"
if [ -n "$UNIT" ]; then
  BODY="${BODY}
Unit: ${UNIT}

--- last 30 journal lines ---
$(journalctl -u "$UNIT" --no-pager -n 30 2>&1 || true)
"
fi

payload() {
  printf '%s' "$BODY" | python3 -c 'import json,sys; print(json.dumps({"from":sys.argv[1],"to":[sys.argv[2]],"subject":sys.argv[3],"text":sys.stdin.read()}))' "$FROM" "$TO" "$SUBJECT"
}

curl -sS -X POST https://api.resend.com/emails \
  -H "Authorization: Bearer ${RESEND_API_KEY}" \
  -H 'Content-Type: application/json' \
  -d "$(payload)"
echo
echo "[backup.alert] sent: ${SUBJECT}"
