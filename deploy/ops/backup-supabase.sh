#!/usr/bin/env bash
# deploy/ops/backup-supabase.sh
#
# Nightly backup of the Raivstream Supabase Postgres (Docker container
# `supabase-db`) on the raivstream VPS. Mirrors the UltraLeague OS pattern
# (web/scripts/backup-database.sh) but for a Dockerised Supabase stack.
#
# Writes /var/backups/raivstream/supabase-YYYYMMDD-HHMMSS.sql.gz (+ .sha256).
# Fails loudly (non-zero exit) if the dump is empty or the command fails.
#
# Retention is handled by deploy/ops/backup-retention.sh (shared rule).
set -euo pipefail

DB_CONTAINER="${SUPABASE_DB_CONTAINER:-supabase-db}"
PG_USER="${SUPABASE_PG_USER:-postgres}"
BACKUP_DIR="${RAIVSTREAM_BACKUP_DIR:-/var/backups/raivstream}"
MIN_BYTES="${RAIVSTREAM_BACKUP_MIN_BYTES:-1024}"   # an empty/garbage dump is a failure

timestamp="$(date -u +%Y%m%d-%H%M%S)"
tmp="${BACKUP_DIR}/.supabase-${timestamp}.sql.gz.tmp"
out="${BACKUP_DIR}/supabase-${timestamp}.sql.gz"

install -d -m 0750 "${BACKUP_DIR}"

if ! docker inspect "${DB_CONTAINER}" >/dev/null 2>&1; then
  echo "[db.backup] FAILED container '${DB_CONTAINER}' not found" >&2
  exit 1
fi

# pg_dumpall from inside the container; pipe through gzip on the host.
docker exec "${DB_CONTAINER}" pg_dumpall -U "${PG_USER}" | gzip -9 > "${tmp}"

bytes="$(stat -c '%s' "${tmp}")"
if [ "${bytes}" -lt "${MIN_BYTES}" ]; then
  echo "[db.backup] FAILED dump too small (${bytes} bytes) for ${DB_CONTAINER}" >&2
  rm -f "${tmp}"
  exit 1
fi

# Sanity: the gzip must decompress to SQL. Capture the head first — piping zcat
# into `head` under `set -o pipefail` gets SIGPIPE ("Broken pipe") and would
# falsely fail this check.
head_sql="$(zcat "${tmp}" 2>/dev/null | head -n 20 || true)"
if ! printf '%s' "${head_sql}" | grep -qiE 'postgresql|create|set |--'; then
  echo "[db.backup] FAILED dump does not look like SQL" >&2
  rm -f "${tmp}"
  exit 1
fi

mv "${tmp}" "${out}"
sha256sum "${out}" > "${out}.sha256"

printf '[db.backup] file=%s bytes=%s sha256=%s\n' \
  "${out}" "${bytes}" "$(cut -d' ' -f1 "${out}.sha256")"
