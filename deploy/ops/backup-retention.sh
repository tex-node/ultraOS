#!/usr/bin/env bash
# deploy/ops/backup-retention.sh
#
# Shared retention for every backup folder on the raivstream VPS.
# Rule: keep the newest KEEP_DAILY dumps + the newest dump of each of the last
# KEEP_WEEKS ISO weeks. NEVER delete the newest dump. Safe to re-run.
#
# Usage: backup-retention.sh <dir> <glob> [keep_daily=14] [keep_weeks=8]
#   backup-retention.sh /var/backups/raivstream 'supabase-*.sql.gz'
set -euo pipefail

DIR="${1:?usage: backup-retention.sh <dir> <glob> [keep_daily] [keep_weeks]}"
GLOB="${2:?glob required}"
KEEP_DAILY="${3:-14}"
KEEP_WEEKS="${4:-8}"

if [ ! -d "$DIR" ]; then
  echo "[backup.retention] dir=$DIR absent — nothing to do"
  exit 0
fi

# newest-first list of dump files (ignore .sha256 sidecars)
mapfile -t files < <(ls -1t "$DIR"/$GLOB 2>/dev/null | grep -v '\.sha256$' || true)
n=${#files[@]}
if [ "$n" -le "$KEEP_DAILY" ]; then
  echo "[backup.retention] dir=$DIR files=$n <= keep_daily=$KEEP_DAILY — nothing to prune"
  exit 0
fi

declare -A keep
# 1) the newest KEEP_DAILY are always kept
for ((i = 0; i < KEEP_DAILY && i < n; i++)); do keep["${files[$i]}"]=1; done

# 2) one per ISO week for the most recent KEEP_WEEKS weeks (newest in each week)
declare -A week_seen
weeks_kept=0
for ((i = KEEP_DAILY; i < n; i++)); do
  f="${files[$i]}"
  w="$(date -r "$f" +%G-W%V)"
  if [ -z "${week_seen[$w]:-}" ]; then
    week_seen["$w"]=1
    keep["$f"]=1
    weeks_kept=$((weeks_kept + 1))
    if [ "$weeks_kept" -ge "$KEEP_WEEKS" ]; then break; fi
  fi
done

# 3) prune the rest (DRY_RUN=1 only reports)
DRY_RUN="${DRY_RUN:-0}"
deleted=0
for ((i = 0; i < n; i++)); do
  f="${files[$i]}"
  if [ -z "${keep[$f]:-}" ]; then
    if [ "$DRY_RUN" = "1" ]; then
      echo "[backup.retention] would delete: $f"
    else
      echo "[backup.retention] deleted: $f"
      rm -f "$f" "$f.sha256"
    fi
    deleted=$((deleted + 1))
  fi
done

# 4) guard: the newest must still exist
newest="${files[0]}"
if [ ! -f "$newest" ]; then
  echo "[backup.retention] FATAL newest dump missing after prune: $newest" >&2
  exit 1
fi

echo "[backup.retention] dir=$DIR kept=$((n - deleted)) deleted=$deleted newest=$newest"
