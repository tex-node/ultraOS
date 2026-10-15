#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"

backup_dir="${ULTRA_BACKUP_DIR:-/var/backups/ultraleagueos}"
# Retention is owned by deploy/ops/backup-retention-all.sh (14 daily + 8 weekly). The inline
# prune below is OFF unless ULTRA_BACKUP_RETENTION_DAYS is set to a positive number of days.
retention_days="${ULTRA_BACKUP_RETENTION_DAYS:-0}"
timestamp="$(date -u +%Y%m%d-%H%M%S)"
backup_path="${backup_dir}/ultraos-${timestamp}.dump"
database_url="$(
  printf '%s' "${DATABASE_URL}" |
    sed -E 's/([?&])schema=[^&]*&?/\1/; s/\?&/\?/; s/[?&]$//'
)"

install -d -m 0750 "${backup_dir}"
pg_dump \
  --dbname="${database_url}" \
  --format=custom \
  --compress=9 \
  --file="${backup_path}"
sha256sum "${backup_path}" > "${backup_path}.sha256"

if [ "${retention_days}" -gt 0 ]; then
  find "${backup_dir}" -maxdepth 1 -type f \
    \( -name 'ultraos-*.dump' -o -name 'ultraos-*.dump.sha256' \) \
    -mtime "+${retention_days}" -delete
fi

printf 'Backup created: %s\n' "${backup_path}"
