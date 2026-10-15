#!/usr/bin/env bash
# deploy/ops/backup-freshness.sh
#
# Daily freshness check (09:00). Alerts if any backup folder's newest dump, or the
# newest R2 object, is older than MAX_AGE_HOURS. This is what catches the
# silently-not-running case that hid the 5.5-week backup failure.
set -uo pipefail

CONF="${RCLONE_CONF:-/etc/ultraos-backup/rclone.conf}"
BUCKET="${R2_BUCKET:-vps-backups-raivstream}"
HOSTN="$(hostname -s)"
MAX_AGE_HOURS="${MAX_AGE_HOURS:-26}"
HOSTNAME_FULL="$(hostname)"

problems=()

check_dir() { # dir glob label
  local dir="$1" glob="$2" label="$3" newest age
  newest="$(ls -1t "$dir"/$glob 2>/dev/null | grep -v '\.sha256$' | head -1 || true)"
  if [ -z "$newest" ]; then
    problems+=("${label}: no dump found in ${dir}")
    return 0
  fi
  age=$(( ( $(date +%s) - $(stat -c %Y "$newest") ) / 3600 ))
  if [ "$age" -gt "$MAX_AGE_HOURS" ]; then
    problems+=("${label}: newest LOCAL dump is ${age}h old ($(basename "$newest"))")
  fi
}

check_r2() { # label
  local label="$1" newest dt ep age
  newest="$(rclone --config "$CONF" lsl "r2:${BUCKET}/${HOSTN}/${label}/" 2>/dev/null | sort -k2,3 | tail -1 || true)"
  if [ -z "$newest" ]; then
    problems+=("${label}: no object in R2 (${BUCKET}/${HOSTN}/${label}/)")
    return 0
  fi
  dt="$(printf '%s' "$newest" | awk '{print $2" "$3}')"
  ep="$(date -d "$dt" +%s 2>/dev/null || echo 0)"
  if [ "$ep" -eq 0 ]; then
    problems+=("${label}: cannot parse R2 timestamp ('${dt}')")
    return 0
  fi
  age=$(( ( $(date +%s) - ep ) / 3600 ))
  if [ "$age" -gt "$MAX_AGE_HOURS" ]; then
    problems+=("${label}: newest R2 object is ${age}h old")
  fi
}

check_dir /var/backups/ultraleagueos         'ultraos-*.dump'    ultraleagueos
check_dir /var/backups/ultraleagueos-staging 'ultraos-*.dump'    ultraos_staging
check_dir /var/backups/raivstream            'supabase-*.sql.gz' raivstream_supabase
check_r2 ultraleagueos
check_r2 ultraos_staging
check_r2 raivstream_supabase

if [ "${#problems[@]}" -eq 0 ]; then
  echo "[freshness] all backups fresh (< ${MAX_AGE_HOURS}h)"
  exit 0
fi

{
  echo "Backup freshness check FAILED."
  echo
  echo "Host: ${HOSTNAME_FULL}"
  echo "Time: $(date -Is)"
  echo "Threshold: ${MAX_AGE_HOURS}h"
  echo
  printf ' - %s\n' "${problems[@]}"
} | /root/raivstream/scripts/send-alert.sh "[ultraos] BACKUP STALE on ${HOSTN}"

echo "[freshness] alerted: ${#problems[@]} problem(s)" >&2
exit 1
