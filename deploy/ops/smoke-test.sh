#!/bin/bash
# Post-deploy smoke test (P15 streak v3, Prompt 2).
#
# WHY: `tsc` and `next build` both passed on a release whose production server refused to boot (two
# dynamic segments with different slug names - Next.js rejects that at STARTUP), and `deploy.sh` only
# reported "service: active". A deploy is not done until representative routes answer with real content.
#
# WHAT IT ASSERTS, per route: HTTP 200 AND the page's signature text in the body. That catches an error
# boundary, a redirect to /no-league, a blank shell, or a route that silently 500s. It also reports the
# service state and the error count since the service started this release.
#
# USAGE
#   bash deploy/ops/smoke-test.sh
#   BASE_URL=https://staging.example bash deploy/ops/smoke-test.sh
#   AUTH_TOKEN=<session-cookie-value> BASE_URL=... bash deploy/ops/smoke-test.sh
#
# ENV
#   BASE_URL       default http://127.0.0.1:4120
#   APP_ROOT       default /opt/ultraos-staging        (used for the DB + env file)
#   AUTH_TOKEN     a NextAuth session-cookie VALUE to reuse. When empty, a short-lived session is minted
#                  for SMOKE_EMAIL using the app's AUTH_SECRET and sessionVersion.
#   SMOKE_EMAIL    default texdevices@gmail.com
#   SMOKE_ORG      organization to put on the minted token
#   ROUTES_FILE    optional file with "path|label|needle" per line, replacing the built-in set
#   SKIP_SMOKE=1   exit 0 without checking (deploy.sh --skip-smoke sets this)
#
# The checks reference concrete LBCL rows (a club, a fixture, a player, a session) because "the page
# returns 200" is not evidence that the page has data. If this ever runs against a database where those
# rows are gone, it should fail loudly rather than pass vacuously.
set -uo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:4120}"
APP_ROOT="${APP_ROOT:-/opt/ultraos-staging}"
WEB="${WEB:-$APP_ROOT/current/web}"
ENV_FILE="${ENV_FILE:-$APP_ROOT/shared/web.env}"
MIGRATE_ENV="${MIGRATE_ENV:-/opt/ultraleagueos/shared/migrate.env}"
SMOKE_EMAIL="${SMOKE_EMAIL:-texdevices@gmail.com}"
SMOKE_ORG="${SMOKE_ORG:-}"
AUTH_TOKEN="${AUTH_TOKEN:-}"

if [ "${SKIP_SMOKE:-0}" = "1" ]; then
  echo "[smoke] SKIPPED (SKIP_SMOKE=1)"
  exit 0
fi

if [ -z "$AUTH_TOKEN" ]; then
  if [ ! -f "$ENV_FILE" ] || [ ! -f "$MIGRATE_ENV" ]; then
    echo "[smoke] FAIL: no AUTH_TOKEN and cannot read $ENV_FILE / $MIGRATE_ENV to mint one" >&2
    exit 1
  fi
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
  priv=$(grep -m1 '^DATABASE_URL=' "$MIGRATE_ENV" | cut -d= -f2-)
  priv="${priv%%\?*}"
  # Use the database the APP talks to, reached with the privileged credentials.
  app_db=$(grep -m1 '^DATABASE_URL=' "$ENV_FILE" | cut -d= -f2- | sed 's/?.*//')
  db_name=$(basename "${app_db:-ultraos_staging}")
  DBURL="${priv%/*}/${db_name}"
  ROW=$(psql "$DBURL" -Atc "select u.id || '|' || coalesce(u.email,'') || '|' || coalesce(u.name,'') || '|' || u.\"sessionVersion\" from \"User\" u join \"UserRoleAssignment\" r on r.\"userId\"=u.id and r.\"revokedAt\" is null and r.role='SUPER_ADMIN' where u.\"isActive\" and u.email='$SMOKE_EMAIL' limit 1" 2>/dev/null)
  IFS='|' read -r USER_ID USER_EMAIL USER_NAME SESSION_VERSION <<< "$ROW"
  if [ -z "${USER_ID:-}" ]; then
    echo "[smoke] FAIL: no active SUPER_ADMIN '$SMOKE_EMAIL' in $DBURL" >&2
    exit 1
  fi
  # No organization given: use the one with the most recorded stats, so the route set is built from a
  # club that actually has data in THIS database (staging and production use different ids).
  if [ -z "${SMOKE_ORG:-}" ]; then
    SMOKE_ORG=$(psql "$DBURL" -Atc "select \"organizationId\" from \"PlayerStat\" group by 1 order by count(*) desc limit 1" 2>/dev/null)
    if [ -z "${SMOKE_ORG:-}" ]; then
      echo "[smoke] FAIL: could not determine an organization with data in $DBURL" >&2
      exit 1
    fi
  fi
  AUTH_TOKEN=$(cd "$WEB" && USER_ID="$USER_ID" USER_EMAIL="$USER_EMAIL" USER_NAME="$USER_NAME" SESSION_VERSION="$SESSION_VERSION" SMOKE_ORG="$SMOKE_ORG" node --input-type=module -e '
const { encode } = await import("next-auth/jwt");
process.stdout.write(await encode({ secret: process.env.AUTH_SECRET, salt: "authjs.session-token",
  token: { sub: process.env.USER_ID, id: process.env.USER_ID, name: process.env.USER_NAME || process.env.USER_EMAIL,
           email: process.env.USER_EMAIL, role: "SUPER_ADMIN", roles: ["SUPER_ADMIN"],
           organizationId: process.env.SMOKE_ORG, sessionVersion: Number(process.env.SESSION_VERSION ?? 0) } }));
')
  case "$AUTH_TOKEN" in eyJ*) ;; *) echo "[smoke] FAIL: could not mint a session (AUTH_SECRET missing?)" >&2; exit 1;; esac
fi

# The route set is derived from the target database: a hard-coded club/player id only works in the
# database it was copied from, and a smoke test whose routes 404 everywhere is worse than none. We pick
# the club and player with the most stat rows in SMOKE_ORG, then build the coaching + passport routes
# from them. A deployment with no stats falls back to the built-in list (and will then fail loudly,
# which is correct: there is nothing to serve).
build_routes() {
  local row club player fixture plan_player
  row=$(psql "$DBURL" -Atc "
    with club as (
      select ps.\"seasonClubId\" as id from \"PlayerStat\" ps
      where ps.\"organizationId\"='$SMOKE_ORG' group by 1 order by count(*) desc limit 1
    )
    select (select id from club),
           (select ps.\"playerId\" from \"PlayerStat\" ps where ps.\"seasonClubId\"=(select id from club) group by 1 order by count(*) desc limit 1),
           (select f.id from \"Fixture\" f where f.\"organizationId\"='$SMOKE_ORG' and f.\"homeSeasonClubId\"=(select id from club) order by f.\"scheduledAt\" desc limit 1),
           (select cp.\"playerId\" from \"CoachingPlan\" cp where cp.\"organizationId\"='$SMOKE_ORG' and cp.status='ACTIVE' limit 1),
           (select cp.\"seasonClubId\" from \"CoachingPlan\" cp where cp.\"organizationId\"='$SMOKE_ORG' and cp.status='ACTIVE' limit 1)
  " 2>/dev/null)
  IFS='|' read -r club player fixture plan_player plan_club <<< "$row"
  if [ -z "${club:-}" ] || [ -z "${player:-}" ]; then
    echo "[smoke] no stats found for $SMOKE_ORG - using the built-in route list" >&2
    return 1
  fi
  echo "/coaching/$club|club hub|Squad"
  echo "/coaching/$club/training|training week|Assign an adopted plan"
  echo "/players/$player/passport|athlete passport|Athlete passport"
  echo "/players/$player/passport|passport provenance|IMPORTED"
  echo "/scoresheets|scoresheets queue|Upload CSV"
  # The trend card only renders for a player with an adopted plan; the plan page itself always has
  # the focus-areas section, so that is the needle when no plan exists yet.
  if [ -n "${plan_player:-}" ] && [ -n "${plan_club:-}" ]; then
    echo "/coaching/$plan_club/players/$plan_player|player plan + trend|Training trend"
  else
    echo "/coaching/$club/players/$player|player plan|Focus areas"
  fi
  # A selection page needs a fixture; include it only when one exists.
  if [ -n "${fixture:-}" ]; then
    echo "/coaching/selection/$fixture|selection|Rotation"
  fi
  return 0
}

DEFAULT_ROUTES=$(cat <<'EOF'
/coaching/cmucf1uc9005dl3kkn8d21rsa|club hub|Squad
/coaching/cmucf1uc9005dl3kkn8d21rsa/opponents/cmucf1txo002pl3kkjut5me5r|opponent plan|Rotation for the last meeting
/coaching/cmucf1uc9005dl3kkn8d21rsa/players/cmucf1uf80069l3kk80zbmp1n|player plan + trend|Training trend
/coaching/cmucf1uc9005dl3kkn8d21rsa/training|training week|Assign an adopted plan
/players/cmucf1uf80069l3kk80zbmp1n/passport|athlete passport|Athlete passport
/players/cmucf1uf80069l3kk80zbmp1n/passport|passport provenance|IMPORTED
/scoresheets|scoresheets queue|Upload CSV
/coaching/selection/cmuxu4gga00afyxkk1u12rua8|selection (normal)|Rotation
/coaching/selection/cmsp9a75d000m4pkk5achuyne|selection (insufficient)|Insufficient games to generate a recommendation
EOF
)

ROUTES="${ROUTES_FILE:+$(cat "$ROUTES_FILE")}"
if [ -z "${ROUTES:-}" ]; then
  ROUTES=$(build_routes) || ROUTES=""
  # Keep the selection routes' extra coverage when the derived set has no fixture.
  if [ -z "$ROUTES" ]; then ROUTES="$DEFAULT_ROUTES"; fi
fi

fails=0
while IFS='|' read -r path label needle; do
  [ -z "${path:-}" ] && continue
  code=$(curl -s -o /tmp/smoke-body.html -w '%{http_code}' --max-time 30 -H "Cookie: authjs.session-token=$AUTH_TOKEN" "$BASE_URL$path")
  if [ "$code" = "200" ] && grep -q -- "$needle" /tmp/smoke-body.html; then
    printf 'PASS  %-34s %s bytes\n' "$label" "$(wc -c < /tmp/smoke-body.html)"
  else
    printf 'FAIL  %-34s http=%s missing="%s"\n' "$label" "$code" "$needle"
    fails=$((fails + 1))
  fi
done <<< "$ROUTES"

service_state="unknown"
errors="0"
if command -v systemctl >/dev/null 2>&1; then
  SERVICE="${SERVICE:-}"
  if [ -z "$SERVICE" ]; then
    SERVICE=$(systemctl list-units --type=service --state=active --no-legend 'ultraos-*' 2>/dev/null | awk '{print $1}' | head -1)
  fi
  if [ -n "$SERVICE" ]; then
    service_state=$(systemctl is-active "$SERVICE")
    since=$(systemctl show -p ActiveEnterTimestamp --value "$SERVICE")
    errors=$(journalctl -u "$SERVICE" --since "$since" --no-pager 2>/dev/null | grep -cE '⨯|Error:' || true)
  fi
fi
echo "-- service: $service_state"
echo "-- errors since the service started this release: ${errors:-0}"
if [ "${errors:-0}" != "0" ]; then fails=$((fails + 1)); fi
if [ "$service_state" != "active" ] && [ "$service_state" != "unknown" ]; then fails=$((fails + 1)); fi

if [ "$fails" -gt 0 ]; then
  echo "SMOKE FAILED ($fails)"
  exit 1
fi
echo "SMOKE OK"
