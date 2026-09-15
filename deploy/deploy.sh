#!/usr/bin/env bash
# Git-based deploy for UltraLeagueOS.
#
# Clones/fetches the repo on the VPS, checks out a ref, builds a release with npm ci + prisma
# generate + next build, optionally applies migrations, swaps the `current` symlink, restarts the
# service, and prunes old releases. Repeatable and idempotent.
#
# The VPS uses the read-only deploy key via the SSH alias github.com-ultraos (see ~/.ssh/config).
#
# Usage:
#   deploy/deploy.sh \
#     --app-root /opt/ultraos-staging \
#     --service ultraos-staging-web.service \
#     --env-file /opt/ultraos-staging/shared/web.env \
#     [--ref origin/main] \
#     [--migrate-db-url "postgresql://<privileged>@127.0.0.1:55411/<db>?schema=public"] \
#     [--skip-migrate] [--keep 5]
#
# Notes:
#   - Migrations run with the PRIVILEGED db url (DDL/RLS), not the app's runtime role.
#   - --env-file is sourced for build-time env; it is never printed.
set -euo pipefail

APP_ROOT=""
SERVICE=""
ENV_FILE=""
MIGRATE_DB_URL=""
REF="origin/main"
SKIP_MIGRATE=0
KEEP=5
REPO_URL="git@github.com-ultraos:tex-node/ultraOS.git"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --app-root)        APP_ROOT="$2"; shift 2 ;;
    --service)         SERVICE="$2"; shift 2 ;;
    --env-file)        ENV_FILE="$2"; shift 2 ;;
    --migrate-db-url)  MIGRATE_DB_URL="$2"; shift 2 ;;
    --ref)             REF="$2"; shift 2 ;;
    --skip-migrate)    SKIP_MIGRATE=1; shift ;;
    --keep)            KEEP="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "$APP_ROOT" || -z "$SERVICE" || -z "$ENV_FILE" ]]; then
  echo "missing required args: --app-root, --service, --env-file" >&2
  exit 2
fi

SRC="$APP_ROOT/source"
RELEASES="$APP_ROOT/releases"
TS="$(date -u +%Y%m%dT%H%M%SZ)"

echo "[deploy] app-root=$APP_ROOT service=$SERVICE ref=$REF"

if [[ ! -d "$SRC/.git" ]]; then
  echo "[deploy] cloning $REPO_URL"
  mkdir -p "$APP_ROOT"
  git clone "$REPO_URL" "$SRC"
fi

cd "$SRC"
git fetch --all --prune
git checkout --force "$REF"
git clean -fdx
SHA="$(git rev-parse --short HEAD)"
echo "[deploy] source at $SHA"

cd "$SRC/web"
echo "[deploy] npm ci"
npm ci --no-audit --no-fund
echo "[deploy] prisma generate"
npx prisma generate

echo "[deploy] next build"
set -a; # shellcheck disable=SC1090
. "$ENV_FILE"; set +a
NODE_OPTIONS="--max-old-space-size=4096" npx next build

REL="$RELEASES/release-$SHA-$TS"
echo "[deploy] creating release $REL"
mkdir -p "$REL"
cp -a "$SRC/web" "$REL/web"

if [[ "$SKIP_MIGRATE" -eq 0 && -n "$MIGRATE_DB_URL" ]]; then
  echo "[deploy] prisma migrate deploy"
  ( cd "$REL/web" && DATABASE_URL="$MIGRATE_DB_URL" npx prisma migrate deploy )
fi

OWNER="$(stat -c '%u:%g' "$APP_ROOT")"
chown -R "$OWNER" "$REL"

PREV="$(readlink -f "$APP_ROOT/current" || true)"
ln -sfn "$REL" "$APP_ROOT/current"
echo "[deploy] current: ${PREV:-none} -> $REL"

systemctl restart "$SERVICE"
sleep 4
echo "[deploy] service: $(systemctl is-active "$SERVICE")"

echo "[deploy] pruning old releases (keep $KEEP)"
ls -1dt "$RELEASES"/release-* 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -rf

echo "[deploy] done: $SHA"
