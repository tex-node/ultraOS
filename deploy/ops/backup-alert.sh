#!/usr/bin/env bash
# deploy/ops/backup-alert.sh
#
# Invoked by backup-alert@.service via OnFailure= on any backup/offsite unit.
# Emails the unit name, host, time and the last 30 journal lines.
set -uo pipefail

UNIT="${1:-unknown}"
HOSTN="$(hostname)"

BODY="$( {
  echo "A backup unit failed."
  echo
  echo "Unit: ${UNIT}"
  echo "Host: ${HOSTN}"
  echo "Time: $(date -Is)"
  echo
  echo "----- last 30 journal lines (${UNIT}) -----"
  journalctl -u "${UNIT}" -n 30 --no-pager 2>&1
} )"

printf '%s\n' "$BODY" | /root/raivstream/scripts/send-alert.sh "[ultraos] BACKUP FAILED: ${UNIT} on ${HOSTN}"
