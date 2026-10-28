#!/bin/bash
# Keep the pre-deploy dump directory bounded (streak v27b).
#
# WHY. Every production release writes a safety dump before it runs, e.g.
#   /var/backups/ultraleagueos-production/ultraleagueos_pre_v26_20261028T074043Z.dump
# Nothing ever deleted them: on 2026-10-28 there were 22 dumps and 88 MB, growing ~1.1 MB per deploy forever. The nightly
# database dumps in /var/backups/ultraleagueos have their own retention (backup-retention-all.sh); this is the other
# directory, and it had none.
#
# What it keeps: the newest N dumps (default 10) plus their .sha256 sidecars, and anything that is not a pre-deploy dump is
# left alone. Deleting the OLDEST first is deliberate: a dump taken a month ago is less useful than the five taken around
# the releases you might actually roll back to.
#
# Usage: prune-pre-deploy-dumps.sh [--dir DIR] [--keep N] [--dry-run]
set -euo pipefail

DIR="/var/backups/ultraleagueos-production"
KEEP=10
DRY_RUN=0

while [ $# -gt 0 ]; do
  case "$1" in
    --dir) DIR="$2"; shift 2 ;;
    --keep) KEEP="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [ ! -d "$DIR" ]; then
  echo "no $DIR on this host - nothing to prune"
  exit 0
fi

mapfile -t DUMPS < <(ls -1t "$DIR"/ultraleagueos_pre_*.dump 2>/dev/null || true)
TOTAL=${#DUMPS[@]}
if [ "$TOTAL" -le "$KEEP" ]; then
  echo "pre-deploy dumps: $TOTAL kept (limit $KEEP) - nothing to prune"
  exit 0
fi

echo "pre-deploy dumps: $TOTAL kept (limit $KEEP) - removing the oldest $((TOTAL - KEEP))"
for dump in "${DUMPS[@]:$KEEP}"; do
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "  would remove: $(basename "$dump")"
  else
    rm -f "$dump" "$dump.sha256" && echo "  removed: $(basename "$dump")"
  fi
done
