#!/bin/bash
# Back up the Vision service's configuration (streak v26, Prompt 1).
#
# WHY THIS EXISTS. `/opt/ultraos-vision/vision.env` is the single file that keeps the vision stack alive: the database URL,
# the analyzer choice, the media mount and the R2 credentials all live in it. It deliberately sits OUTSIDE every checkout,
# because `git clean -fdx` on a deploy would delete it (that is exactly how v24 lost it). The consequence is that no
# deploy and no git clone contains it, and until this script the nightly backup captured only the database - so a host loss
# would have taken the vision worker's configuration with it, unrecoverably.
#
# What it captures: the CONFIGURATION, not the binaries. The directory also holds a Python venv (hundreds of MB, rebuildable
# from requirements.txt) and rendered highlight clips (published to R2), neither of which belongs in a nightly tar. The first
# attempt archived everything and produced a slow, bloated archive, which is how the distinction was found.
#
# Usage: backup-vision-config.sh [--backup-dir DIR] [--retention-days N]
set -euo pipefail

# The nightly directory, next to the DB dumps this unit already writes. NOT /var/backups/ultraleagueos-production: that
# directory is root-owned and holds the pre-deploy dumps written by deploy.sh, while this unit runs as `ultraos` - writing
# there failed with "Permission denied" on the first attempt, which is how the distinction was found.
BACKUP_DIR="/var/backups/ultraleagueos"
RETENTION_DAYS=30
SOURCE_DIR="/opt/ultraos-vision"

while [ $# -gt 0 ]; do
  case "$1" in
    --backup-dir) BACKUP_DIR="$2"; shift 2 ;;
    --retention-days) RETENTION_DAYS="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [ ! -d "$SOURCE_DIR" ]; then
  # Not an error: a host without the vision stack has nothing to back up, and the DB backup must not fail because of it.
  echo "no $SOURCE_DIR on this host - nothing to back up" >&2
  exit 0
fi

install -d -m 0750 "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ARCHIVE="$BACKUP_DIR/vision-env-$STAMP.tar.gz"

# -C the parent so the archive holds `ultraos-vision/...` rather than absolute paths: restoring is then a plain
# `tar -xzf ... -C /opt`, which never writes outside the directory the operator names.
tar --create --gzip --file "$ARCHIVE" --directory "$(dirname "$SOURCE_DIR")" \
  --owner=0 --group=0 --numeric-owner \
  --exclude=venv --exclude=highlights --exclude=__pycache__ --exclude='*.mp4' --exclude='*.pt' \
  "$(basename "$SOURCE_DIR")"

# A backup that silently omits the one file it exists for is worse than no backup at all, so assert it is inside.
if ! tar -tzf "$ARCHIVE" | grep -qx 'ultraos-vision/vision.env'; then
  echo "ERROR: the archive does not contain vision.env (check its permissions: the unit runs as ultraos)" >&2
  rm -f "$ARCHIVE"
  exit 1
fi

# The env file contains secrets, so the archive does too. 0640 root:root: readable by root and the service user's group if
# the operator adds one, never world-readable.
chmod 0640 "$ARCHIVE"
sha256sum "$ARCHIVE" > "$ARCHIVE.sha256"

if [ "$RETENTION_DAYS" -gt 0 ]; then
  find "$BACKUP_DIR" -maxdepth 1 -type f \
    \( -name 'vision-env-*.tar.gz' -o -name 'vision-env-*.tar.gz.sha256' \) \
    -mtime "+$RETENTION_DAYS" -delete
fi

echo "vision config backed up: $ARCHIVE ($(du -h "$ARCHIVE" | cut -f1))"
echo "verifies with: tar -tzf $ARCHIVE"
