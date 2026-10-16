#!/usr/bin/env bash
# deploy/ops/backup-offsite.sh
#
# Copy-only off-site upload of every backup folder on the raivstream VPS to
# Cloudflare R2, encrypted via an rclone `crypt` remote. NEVER sync (no R2
# deletions — retention is R2 lifecycle rules).
#
# Layout: <host>/<db>/daily/<file>   every run
#         <host>/<db>/monthly/<file> on the 1st of each month
#
# Installed at /root/ops/backup-offsite.sh; run by cron at 04:00 (after all
# backups: ultraos 03:00, raivstream 03:25, staging 03:43; before retention 04:30).
set -euo pipefail

CONF="${RCLONE_CONF:-/etc/ultraos-backup/rclone.conf}"
HOST="$(hostname)"
DAY="$(date +%d)"

push() { # $1 local dir  $2 include glob  $3 remote db name
  local dir="$1" glob="$2" db="$3"
  [ -d "$dir" ] || return 0
  rclone --config "$CONF" copy "$dir" "r2crypt:${HOST}/${db}/daily/" \
    --include "$glob" --retries 3 --low-level-retries 5
  if [ "$DAY" = "01" ]; then
    rclone --config "$CONF" copy "$dir" "r2crypt:${HOST}/${db}/monthly/" \
      --include "$glob" --retries 3 --low-level-retries 5
  fi
}

push /var/backups/raivstream            'supabase-*' raivstream
push /var/backups/ultraleagueos         'ultraos-*'  ultraleagueos
push /var/backups/ultraleagueos-staging 'ultraos-*'  ultraleagueos-staging

echo "[offsite] uploaded host=${HOST} day=${DAY}"
