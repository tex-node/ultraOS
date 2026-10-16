#!/usr/bin/env bash
# deploy/ops/r2-configure.sh
#
# Builds /etc/ultraos-backup/rclone.conf from a root-only source file, without
# ever printing secret values. Creates an S3 remote [r2] (Cloudflare R2) and a
# crypt remote [r2crypt] layered over it. Also writes the PLAIN crypt password to
# a separate 600 file so it can be copied offline (without it backups are lost).
#
# Usage: r2-configure.sh [source] [conf] [password-file]
#   source defaults to /etc/ultraos-backup/r2-source.txt  (shredded after)
set -euo pipefail
umask 077

SRC="${1:-/etc/ultraos-backup/r2-source.txt}"
CONF="${2:-/etc/ultraos-backup/rclone.conf}"
PW="${3:-/etc/ultraos-backup/rclone-crypt-password.txt}"
BUCKET="${R2_BUCKET:-vps-backups-raivstream}"

get() {
  local key="$1"
  # tolerant of "KEY = value", "KEY: value", surrounding spaces
  awk -v k="$key" 'index($0, k) == 1 { line=$0; sub(/^[^:=]*[:=][ \t]*/, "", line); gsub(/[ \t]+$/, "", line); print line; exit }' "$SRC"
}

AK="$(get 'ACCESS KEY ID')"
SK="$(get 'SECRET ACCESS KEY')"
EP="$(get 'JURISDICTION S3 ENDPOINT')"
echo "parsed lengths: ak=${#AK} sk=${#SK} ep=${#EP}"
if [ "${#AK}" -lt 10 ] || [ "${#SK}" -lt 10 ] || [ "${#EP}" -lt 10 ]; then
  echo "PARSE FAILED — refusing to write an empty config" >&2
  exit 1
fi

CRYPTPW="$(head -c 32 /dev/urandom | base64 | tr -d '\n')"
CRYPTSALT="$(head -c 16 /dev/urandom | base64 | tr -d '\n')"

cat > "$CONF" <<EOF
[r2]
type = s3
provider = Cloudflare
access_key_id = $AK
secret_access_key = $SK
endpoint = $EP
acl = private

[r2crypt]
type = crypt
remote = r2:${BUCKET}
filename_encryption = standard
directory_name_encryption = true
password = $(printf '%s' "$CRYPTPW" | rclone obscure -)
password2 = $(printf '%s' "$CRYPTSALT" | rclone obscure -)
EOF
chmod 600 "$CONF"

printf '%s\n' "$CRYPTPW" > "$PW"
chmod 600 "$PW"
# rclone crypt uses TWO secrets: the password AND password2 (the salt).
# Both are required to decrypt; without the salt the backups are lost.
PW2="${PW%.txt}-salt.txt"
printf '%s\n' "$CRYPTSALT" > "$PW2"
chmod 600 "$PW2"

shred -u "$SRC" 2>/dev/null || rm -f "$SRC"

echo "wrote $CONF, $PW and $PW2; source shredded"
