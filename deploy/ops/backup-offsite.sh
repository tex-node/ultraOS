#!/usr/bin/env bash
# deploy/ops/backup-offsite.sh
#
# Copy the newest dump of each backup folder to Cloudflare R2. COPY ONLY - never
# deletes on R2 (rclone copy, not sync). Credentials live in
# /etc/ultraos-backup/rclone.conf (root-only, 0600); this runs as root.
#
# Paths:   r2:<bucket>/<host>/<db>/            (daily; R2 lifecycle expires after 30 days)
#          r2:<bucket>/monthly/<host>/<db>/    (1st of the month; R2 lifecycle expires after 365 days)
#
# Run by backup-offsite.timer at 04:00 (after ultraos 03:00, raivstream 03:25, staging 03:43).
set -euo pipefail

CONF="${RCLONE_CONF:-/etc/ultraos-backup/rclone.conf}"
BUCKET="${R2_BUCKET:-vps-backups-raivstream}"
REMOTE="r2:${BUCKET}"
HOST="$(hostname -s)"

MONTHLY=0
[ "${1:-}" = "--monthly" ] && MONTHLY=1
[ "$(date +%d)" = "01" ] && MONTHLY=1   # keep a monthly copy automatically on the 1st

[ -f "$CONF" ] || { echo "[offsite] ERROR config ${CONF} missing" >&2; exit 1; }
command -v rclone >/dev/null || { echo "[offsite] ERROR rclone not found" >&2; exit 1; }

rc() { rclone --config "$CONF" --s3-no-check-bucket "$@"; }

copy_one() { # dir glob db-label
  local dir="$1" glob="$2" label="$3" newest
  newest="$(ls -1t "$dir"/$glob 2>/dev/null | grep -v '\.sha256$' | head -1 || true)"
  if [ -z "$newest" ]; then
    echo "[offsite] no dump in ${dir} (${glob}) - skipping ${label}"
    return 0
  fi

  rc copy --no-traverse "$newest" "${REMOTE}/${HOST}/${label}/" >/dev/null
  [ -f "${newest}.sha256" ] && rc copy --no-traverse "${newest}.sha256" "${REMOTE}/${HOST}/${label}/" >/dev/null
  echo "[offsite] daily   ${label}: $(basename "$newest")"

  if [ "$MONTHLY" = "1" ]; then
    rc copy --no-traverse "$newest" "${REMOTE}/monthly/${HOST}/${label}/" >/dev/null
    [ -f "${newest}.sha256" ] && rc copy --no-traverse "${newest}.sha256" "${REMOTE}/monthly/${HOST}/${label}/" >/dev/null
    echo "[offsite] monthly ${label}: $(basename "$newest")"
  fi
}

copy_one /var/backups/ultraleagueos         'ultraos-*.dump'    ultraleagueos
copy_one /var/backups/ultraleagueos-staging 'ultraos-*.dump'    ultraos_staging
copy_one /var/backups/raivstream            'supabase-*.sql.gz' raivstream_supabase

echo "[offsite] done host=${HOST} monthly=${MONTHLY}"
