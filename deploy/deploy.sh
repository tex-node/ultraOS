#!/usr/bin/env bash
# Git-based deploy for UltraLeagueOS.
#
# Clones/fetches the repo on the VPS, checks out a ref, builds a release with npm ci + prisma
# generate + next build, optionally applies migrations, swaps the `current` symlink, restarts the
# service, and prunes old releases. Repeatable and idempotent.
#
# The VPS reads the repo with a read-only deploy key via the SSH alias github.com-ultraos
# (see ~/.ssh/config).
#
# Usage:
#   deploy/deploy.sh \
#     --app-root /opt/ultraos-staging \
#     --service ultraos-staging-web.service \
#     --env-file /opt/ultraos-staging/shared/web.env \
#     [--ref origin/main] [--migrate] [--migrate-env-file <path>] [--migrate-db-url <url>] [--keep 5]
#
# Migrations:
#   Pass --migrate to run `prisma migrate deploy` for this release. The privileged DATABASE_URL is
#   read from --migrate-env-file (default <app-root>/shared/migrate.env), or from --migrate-db-url
#   if given. Never put the privileged URL on the command line unless you accept it in `ps`.
set -euo pipefail

APP_ROOT=""
SERVICE=""
ENV_FILE=""
REF="origin/main"
RUN_MIGRATE=0
MIGRATE_ENV_FILE=""
MIGRATE_DB_URL=""
KEEP=5
REPO_URL="git@github.com-ultraos:tex-node/ultraOS.git"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --app-root)         APP_ROOT="$2"; shift 2 ;;
    --service)          SERVICE="$2"; shift 2 ;;
    --env-file)         ENV_FILE="$2"; shift 2 ;;
    --ref)              REF="$2"; shift 2 ;;
    --migrate)          RUN_MIGRATE=1; shift ;;
    --migrate-env-file) MIGRATE_ENV_FILE="$2"; shift 2 ;;
    --migrate-db-url)   MIGRATE_DB_URL="$2"; shift 2 ;;
    --keep)             KEEP="$2"; shift 2 ;;
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

echo "[deploy] app-root=$APP_ROOT service=$SERVICE ref=$REF migrate=$RUN_MIGRATE"

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

if [[ "$RUN_MIGRATE" -eq 1 ]]; then
  TARGET_URL="$MIGRATE_DB_URL"
  if [[ -z "$TARGET_URL" ]]; then
    MIGRATE_ENV_FILE="${MIGRATE_ENV_FILE:-$APP_ROOT/shared/migrate.env}"
    if [[ ! -f "$MIGRATE_ENV_FILE" ]]; then
      echo "[deploy] --migrate set but no --migrate-db-url and $MIGRATE_ENV_FILE not found" >&2
      exit 3
    fi
    TARGET_URL="$(grep '^DATABASE_URL=' "$MIGRATE_ENV_FILE" | head -1 | sed 's/^DATABASE_URL=//')"
  fi
  if [[ -z "$TARGET_URL" ]]; then
    echo "[deploy] could not resolve a privileged database URL" >&2
    exit 3
  fi
  echo "[deploy] prisma migrate deploy"
  ( cd "$REL/web" && DATABASE_URL="$TARGET_URL" npx prisma migrate deploy )
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
