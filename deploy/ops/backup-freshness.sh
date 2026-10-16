#!/usr/bin/env bash
# deploy/ops/backup-freshness.sh
#
# Daily 09:00 check: alerts if the newest LOCAL dump (any backup folder) or the
# newest OFF-SITE (R2) object is older than MAX_AGE_H hours. This catches the
# "silently not running" case that hid the 5.5-week failure.
#
# Installed at /root/ops/backup-freshness.sh; cron 0 9 * * *.
set -euo pipefail

MAX_AGE_H="${MAX_AGE_H:-26}"
CONF="${RCLONE_CONF:-/etc/ultraos-backup/rclone.conf}"
ALERT=/root/ops/backup-alert.sh
NOW="$(date +%s)"
STALE=0

alert() { "$ALERT" "$1" "" >/dev/null 2>&1 || true; echo "[backup.freshness] ALERT: $1"; STALE=1; }

check_local() { # $1 dir  $2 glob  $3 label
  local dir="$1" glob="$2" label="$3"
  [ -d "$dir" ] || { alert "STALE BACKUP: $label folder missing ($dir)"; return; }
  local newest
  newest="$(ls -t "$dir"/$glob 2>/dev/null | grep -v '\.sha256$' | head -n1 || true)"
  if [ -z "$newest" ]; then alert "STALE BACKUP: $label has no dumps in $dir"; return; fi
  local age=$(( (NOW - $(stat -c %Y "$newest")) / 3600 ))
  if [ "$age" -gt "$MAX_AGE_H" ]; then
    alert "STALE BACKUP: $label newest is ${age}h old (limit ${MAX_AGE_H}h) — $newest"
  else
    echo "[backup.freshness] ok local $label age=${age}h"
  fi
}

check_local /var/backups/raivstream            'supabase-*.sql.gz' raivstream
check_local /var/backups/ultraleagueos         'ultraos-*.dump'    ultraleagueos
check_local /var/backups/ultraleagueos-staging '*.dump'           ultraleagueos-staging

# Off-site freshness: newest object under <host>/ on the crypt remote.
# lsf --format "tp" => "<YYYY-MM-DD HH:MM:SS>;<path>" (rclone lsl has no -R here).
if command -v rclone >/dev/null 2>&1 && [ -f "$CONF" ]; then
  newest_r2="$(rclone --config "$CONF" lsf "r2crypt:$(hostname)/" -R --format tp 2>/dev/null \
    | sort | tail -n1 || true)"
  if [ -z "$newest_r2" ]; then
    alert "STALE BACKUP: no off-site objects found on R2 for $(hostname)"
  else
    r2_date="$(printf '%s' "$newest_r2" | cut -d';' -f1)"
    r2_epoch="$(date -d "$r2_date" +%s 2>/dev/null || echo 0)"
    if [ "$r2_epoch" -gt 0 ]; then
      age=$(( (NOW - r2_epoch) / 3600 ))
      if [ "$age" -gt "$MAX_AGE_H" ]; then
        alert "STALE BACKUP: newest R2 object is ${age}h old (limit ${MAX_AGE_H}h)"
      else
        echo "[backup.freshness] ok offsite age=${age}h"
      fi
    else
      echo "[backup.freshness] could not parse R2 date: $newest_r2"
    fi
  fi
fi

if [ "$STALE" = 0 ]; then echo "[backup.freshness] all fresh"; fi
exit 0
