#!/bin/bash
# Deploy with a full transcript (streak v23, Prompt 1).
#
# WHY THIS EXISTS: in v22 one production deploy "produced no output while a retry worked". The cause was not the deploy
# script - it runs under `set -euo pipefail` and exits non-zero - it was the pipeline wrapped around it:
#
#     ssh host "bash deploy.sh ... | grep -E 'SMOKE|done:' | tail -2"
#
# The exit status of that pipeline is GREP's, not the deploy's, and a deploy that fails before printing a matching line is
# indistinguishable from one that printed nothing at all. Two unfiltered deploys and this wrapper are the fix: never filter
# a deploy, always keep the transcript, and always propagate the DEPLOY's exit code.
#
# Usage:
#   deploy/ops/deploy-with-log.sh production
#   deploy/ops/deploy-with-log.sh staging [--ref origin/main] [--migrate] [extra deploy.sh flags...]
#
# Writes deploy-logs/deploy-<env>-<utc timestamp>.log and prints only the last few lines. Exit code is the deploy's.
set -uo pipefail

ENVIRONMENT="${1:-}"
shift || true
case "$ENVIRONMENT" in
  production)
    APP_ROOT=/opt/ultraleagueos; SERVICE=ultraos-web.service ;;
  staging)
    APP_ROOT=/opt/ultraos-staging; SERVICE=ultraos-staging-web.service ;;
  *)
    echo "usage: deploy-with-log.sh <production|staging> [deploy.sh flags...]" >&2
    exit 2 ;;
esac

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOG_DIR="$REPO_ROOT/deploy-logs"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/deploy-$ENVIRONMENT-$(date -u +%Y%m%dT%H%M%SZ).log"

echo "deploy → $ENVIRONMENT · log → $LOG"
# No pipe between the deploy and the file: the log is the deploy's own stdout+stderr, and $? below is the deploy's.
bash /root/deploy.sh \
  --app-root "$APP_ROOT" \
  --service "$SERVICE" \
  --env-file "$APP_ROOT/shared/web.env" \
  "$@" >"$LOG" 2>&1
STATUS=$?

tail -5 "$LOG"
echo "exit status: $STATUS · transcript: $LOG ($(wc -l <"$LOG") lines)"
exit "$STATUS"
