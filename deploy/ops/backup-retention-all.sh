#!/usr/bin/env bash
# deploy/ops/backup-retention-all.sh
#
# Runs the shared retention rule for every backup folder on the raivstream VPS.
# Installed at /root/raivstream/scripts/backup-retention-all.sh and run nightly
# by cron at 04:30 (after all backups: ultraos 03:00, raivstream 03:25,
# staging 03:43). Re-runnable.
set -euo pipefail

R="/root/raivstream/scripts/backup-retention.sh"

"${R}" /var/backups/raivstream            'supabase-*.sql.gz'
"${R}" /var/backups/ultraleagueos         'ultraos-*.dump'
"${R}" /var/backups/ultraleagueos-staging '*.dump'
