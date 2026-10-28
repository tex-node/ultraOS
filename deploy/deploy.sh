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
#     [--ref origin/main] [--migrate] [--skip-smoke] [--migrate-env-file <path>] [--migrate-db-url <url>] [--keep 5]
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
RUN_SMOKE=1
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
    --skip-smoke)       RUN_SMOKE=0; shift ;;
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

# The vision service's .env is gitignored (it holds DATABASE_URL/storage credentials), so `git clean -fdx`
# above removes it on every deploy and `docker compose up` in services/vision then fails with "env file not
# found" - which looks like the vision stack is broken rather than unconfigured. Recreate it from the example
# when it is missing; never overwrite an existing one, since it may hold hand-edited credentials.
if [[ -d "$SRC/services/vision" ]]; then
  if [[ ! -f "$SRC/services/vision/.env" ]]; then
    cp "$SRC/services/vision/.env.example" "$SRC/services/vision/.env"
    echo "[deploy] services/vision/.env recreated from .env.example (review its DATABASE_URL before starting the stack)"
  else
    echo "[deploy] services/vision/.env kept"
  fi
fi

cd "$SRC/web"
echo "[deploy] npm ci"
npm ci --no-audit --no-fund
echo "[deploy] prisma generate"
npx prisma generate

# ---------------------------------------------------------------------------------------------
# Pre-flight: refuse to ship code whose migrations are not applied to the target database.
#
# This exists because it has now happened twice: a release whose code needed a schema change
# reached an environment without it, and the first request that touched the table returned a
# Prisma P2022 error while every health check still said green - `GameEvent.resolvedBy` in
# production (Oct 2026, migrated 2026-10-18) and the missing runtime-role GRANT on
# `CoachingPlan` in staging (same week). Deploys do not run migrations by default, so without
# this check nothing does.
#
# Runs after npm ci / prisma generate (it needs the CLI and the migrations directory) and before
# the release is built or the symlink swapped, so a mismatch stops the deploy with nothing
# changed. It uses the same privileged URL the --migrate step would use.
#
# A missing privileged URL is NOT fatal - a machine without migrate.env would otherwise be unable
# to deploy at all - but it says so loudly instead of skipping silently.
# ---------------------------------------------------------------------------------------------
PREFLIGHT_URL="$MIGRATE_DB_URL"
if [[ -z "$PREFLIGHT_URL" ]]; then
  PREFLIGHT_ENV_FILE="${MIGRATE_ENV_FILE:-$APP_ROOT/shared/migrate.env}"
  if [[ -f "$PREFLIGHT_ENV_FILE" ]]; then
    PREFLIGHT_URL="$(grep '^DATABASE_URL=' "$PREFLIGHT_ENV_FILE" | head -1 | sed 's/^DATABASE_URL=//')"
  fi
fi
if [[ -n "$PREFLIGHT_URL" ]]; then
  echo "[deploy] prisma migrate status (pre-flight)"
  STATUS_OUT="$(DATABASE_URL="$PREFLIGHT_URL" npx prisma migrate status 2>&1 || true)"
  echo "$STATUS_OUT" | tail -4
  if echo "$STATUS_OUT" | grep -q 'not yet been applied'; then
    if [[ "$RUN_MIGRATE" -eq 1 ]]; then
      # --migrate was passed: applying them is exactly what the caller asked for. Do not halt here
      # (that was a bug fixed 2026-10-18: the pre-flight refused even a --migrate deploy). The
      # migrate step below runs before the swap, and its result is re-checked afterwards.
      echo "[deploy] pending migrations found - they will be applied by --migrate before the swap"
    else
      {
        echo ""
        echo "##########################################################################"
        echo "# DEPLOY HALTED: this ref has migrations that are NOT applied."
        echo "# Shipping it would run code against a schema it does not expect."
        echo "#"
        echo "# Re-run the same command with --migrate, after a verified backup,"
        echo "# or apply the migration separately and re-run this deploy."
        echo "#"
        echo "# Nothing was built, swapped, or restarted."
        echo "##########################################################################"
        echo "$STATUS_OUT" | sed -n '/not yet been applied/,$p' | head -20
      } >&2
      exit 4
    fi
  fi
else
  echo "[deploy] WARNING: no privileged database URL (no --migrate-db-url and no $APP_ROOT/shared/migrate.env)" >&2
  echo "[deploy] WARNING: pending migrations were NOT checked - this deploy may ship code ahead of its schema" >&2
fi

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
  # Re-check: a failed or partial deploy must not proceed to the swap. This is the guarantee the
  # pre-flight was meant to provide, now enforced after the migration instead of before it.
  POST_STATUS="$(cd "$REL/web" && DATABASE_URL="$TARGET_URL" npx prisma migrate status 2>&1 || true)"
  if echo "$POST_STATUS" | grep -q 'not yet been applied'; then
    {
      echo ""
      echo "# DEPLOY HALTED: migrations are STILL not applied after --migrate."
      echo "# The release was built but NOT swapped in; the service still runs the previous release."
    } >&2
    echo "$POST_STATUS" | tail -10 >&2
    exit 4
  fi
  echo "[deploy] migrations: up to date"
fi

OWNER="$(stat -c '%u:%g' "$APP_ROOT")"
chown -R "$OWNER" "$REL"

PREV="$(readlink -f "$APP_ROOT/current" || true)"
ln -sfn "$REL" "$APP_ROOT/current"
echo "[deploy] current: ${PREV:-none} -> $REL"

systemctl restart "$SERVICE"
sleep 4
echo "[deploy] service: $(systemctl is-active "$SERVICE")"

# Install the smoke test from the deployed ref (the release only contains web/, so the script cannot
# live inside it) and run it. A release that boots but serves nothing must fail the deploy.
if [[ -f "$SRC/deploy/ops/smoke-test.sh" ]]; then
  cp "$SRC/deploy/ops/smoke-test.sh" "$APP_ROOT/smoke-test.sh"
  chmod +x "$APP_ROOT/smoke-test.sh"
fi
if [[ "$RUN_SMOKE" -eq 1 ]]; then
  SMOKE_SCRIPT="$APP_ROOT/smoke-test.sh"
  if [[ -f "$SMOKE_SCRIPT" ]]; then
    echo "[deploy] smoke test"
    SMOKE_BASE="${SMOKE_BASE_URL:-$(grep -m1 '^AUTH_URL=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '"' | sed 's/ *$//')}"
    # AUTH_URL may be the public hostname; on the box itself the app listens on loopback.
    if [[ "$SMOKE_BASE" == http*://app.* || "$SMOKE_BASE" == https://* ]]; then
      SMOKE_BASE="http://127.0.0.1:$(systemctl cat "$SERVICE" | sed -n 's/.*--port \([0-9]*\).*/\1/p' | head -1)"
    fi
    if ! BASE_URL="${SMOKE_BASE:-http://127.0.0.1:4120}" APP_ROOT="$APP_ROOT" SERVICE="$SERVICE" ENV_FILE="$ENV_FILE" SMOKE_ORG="${SMOKE_ORG:-}" SMOKE_EMAIL="${SMOKE_EMAIL:-texdevices@gmail.com}" \
         MIGRATE_ENV="${MIGRATE_ENV_FILE:-$APP_ROOT/shared/migrate.env}" bash "$SMOKE_SCRIPT"; then
      {
        echo ""
        echo "##########################################################################"
        echo "# DEPLOY FAILED THE SMOKE TEST - the new release is live but is not serving."
        echo "# Roll back now:"
        echo "#   ln -sfn $PREV $APP_ROOT/current && systemctl restart $SERVICE"
        echo "# (previous release: ${PREV:-none})"
        echo "##########################################################################"
      } >&2
      exit 5
    fi
  else
    echo "[deploy] WARNING: no smoke test found at $SMOKE_SCRIPT - NOT verifying the release" >&2
  fi
fi

echo "[deploy] pruning old releases (keep $KEEP)"
ls -1dt "$RELEASES"/release-* 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -rf

# Post-deploy hygiene: what actually keeps disk flat, measured rather than assumed.
#
# MEASURED (2026-10-28, two full cycles = staging + production each): net **7 MB per cycle**, transient peak **+1.35 GB**
# during a build that is released again afterwards. The thing holding steady state flat is the release window above
# (`--keep`, default 5 x 1.4 GB); the lines below reclaim the leftovers that are not part of that window.
#
# PLACEMENT: after the smoke test, deliberately. The smoke test above already decided whether this deploy is good; if it
# failed we exited at 5 and cleanup does not matter. This runs last so the tail of the log is the post-cleanup disk state.
#
# SAFE TO FAIL: `|| true` on every line. A cleanup that cannot run - /tmp permissions changed, a docker builder version
# that no longer accepts the filter - is a tidiness problem, not an outage, and it must never turn a green deploy red.
BUILDER_BEFORE=$(docker system df --format '{{.Type}}|{{.Reclaimable}}' 2>/dev/null | awk -F'|' '/Build Cache/{print $2}') || true
CACHE_KB=$(du -sk /opt/ultraos-staging/source/web/node_modules/.cache 2>/dev/null | cut -f1) || true
echo "[deploy] hygiene (build cache: ${BUILDER_BEFORE:-unknown} · next cache: $(( ${CACHE_KB:-0} / 1024 )) MB)"
# The web deploy does not run `docker build`, so this prune reclaims nothing for it; it is here because it is the same script
# and the vision images are built on this host. Harmless when empty, useful after a vision rebuild.
docker builder prune -f --filter "until=24h" > /dev/null 2>&1 || true
# TRADEOFF, stated in every deploy log: this is Next's compilation cache. It is ~12 KB today (Next 16 keeps its build in
# `.next/cache`, which must NOT be deleted), so removing it costs nothing now; if it ever grows, the next build pays 20-40 s
# and this line is worth commenting out during a heavy development day.
rm -rf /opt/ultraos-staging/source/web/node_modules/.cache 2>/dev/null || true
# `*-build*` catches the whole class of scratch directories, not one streak's name (livekey-build, node22-check, …).
# `-mtime +1` is the real safety net: today's scratch is never touched.
find /tmp -maxdepth 1 -type d -name "*-build*" -mtime +1 -exec rm -rf {} + 2>/dev/null || true
# The pre-deploy dump directory had no retention at all: 22 dumps / 88 MB on 2026-10-28, growing ~1.1 MB per release
# forever. Keep the newest 10 - see deploy/ops/prune-pre-deploy-dumps.sh for why newest-first is the right end to trim.
if [[ -f "$SRC/deploy/ops/prune-pre-deploy-dumps.sh" ]]; then
  bash "$SRC/deploy/ops/prune-pre-deploy-dumps.sh" 2>&1 | sed 's/^/  /' || true
else
  bash /usr/local/sbin/prune-pre-deploy-dumps.sh 2>&1 | sed 's/^/  /' || true
fi
# Header plus the root filesystem only - visible over time, without cluttering the log with every mount.
df -h / | awk 'NR==1 || /\//'

echo "[deploy] done: $SHA"
