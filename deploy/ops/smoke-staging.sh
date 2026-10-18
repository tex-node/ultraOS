#!/bin/bash
# Post-deploy smoke check for the staging app (P15 streak, 2026-10-18).
#
# WHY THIS EXISTS: `tsc` and `next build` both passed on a release whose production server refused to
# boot (two dynamic segments with different slug names - Next.js rejects that at STARTUP). The deploy
# script only reports "service: active", which a crash-looping-then-supervised process can still
# satisfy briefly. This script asserts, for a representative set of routes, that the response is 200
# AND contains the page's signature text - so an error boundary, a redirect to /no-league, or a blank
# shell fails the check.
#
# USAGE (on the staging host, as root):
#   bash deploy/ops/smoke-staging.sh
#   BASE=http://127.0.0.1:4120 SMOKE_EMAIL=someone@example.com bash deploy/ops/smoke-staging.sh
#
# It mints a short-lived NextAuth session for an existing SUPER_ADMIN in the staging database, so it
# needs the staging web env (AUTH_SECRET) and the privileged DB URL - the same inputs deploy.sh uses.
set -uo pipefail

BASE="${BASE:-http://127.0.0.1:4120}"
WEB="${WEB:-/opt/ultraos-staging/current/web}"
LBCL_CLUB="${LBCL_CLUB:-cmucf1uc9005dl3kkn8d21rsa}"
SMOKE_EMAIL="${SMOKE_EMAIL:-texdevices@gmail.com}"
SMOKE_ORG="${SMOKE_ORG:-cmucf1lo500003bkk1zyyoxmh}"
ENV_FILE="${ENV_FILE:-/opt/ultraos-staging/shared/web.env}"
MIGRATE_ENV="${MIGRATE_ENV:-/opt/ultraleagueos/shared/migrate.env}"

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

priv=$(grep -m1 '^DATABASE_URL=' "$MIGRATE_ENV" | cut -d= -f2-)
priv="${priv%%\?*}"
DBURL="${priv%/*}/ultraos_staging"

ROW=$(psql "$DBURL" -Atc "select u.id || '|' || coalesce(u.email,'') || '|' || coalesce(u.name,'') || '|' || u.\"sessionVersion\" from \"User\" u join \"UserRoleAssignment\" r on r.\"userId\"=u.id and r.\"revokedAt\" is null and r.role='SUPER_ADMIN' where u.\"isActive\" and u.email='$SMOKE_EMAIL' limit 1")
IFS='|' read -r USER_ID USER_EMAIL USER_NAME SESSION_VERSION <<< "$ROW"
if [ -z "${USER_ID:-}" ]; then
  echo "FAIL  no active SUPER_ADMIN '$SMOKE_EMAIL' in the staging database"
  exit 1
fi
TOKEN=$(cd "$WEB" && USER_ID="$USER_ID" USER_EMAIL="$USER_EMAIL" USER_NAME="$USER_NAME" SESSION_VERSION="$SESSION_VERSION" SMOKE_ORG="$SMOKE_ORG" node --input-type=module -e '
const { encode } = await import("next-auth/jwt");
process.stdout.write(await encode({ secret: process.env.AUTH_SECRET, salt: "authjs.session-token",
  token: { sub: process.env.USER_ID, id: process.env.USER_ID, name: process.env.USER_NAME || process.env.USER_EMAIL,
           email: process.env.USER_EMAIL, role: "SUPER_ADMIN", roles: ["SUPER_ADMIN"],
           organizationId: process.env.SMOKE_ORG, sessionVersion: Number(process.env.SESSION_VERSION ?? 0) } }));
')
case "$TOKEN" in eyJ*) ;; *) echo "FAIL  could not mint a session (AUTH_SECRET missing?)"; exit 1;; esac

fails=0
expect() {
  local url="$1" label="$2" needle="$3" code
  code=$(curl -s -o /tmp/smoke.html -w '%{http_code}' --max-time 30 -H "Cookie: authjs.session-token=$TOKEN" "$BASE$url")
  if [ "$code" = "200" ] && grep -q -- "$needle" /tmp/smoke.html; then
    printf 'PASS  %-34s %s bytes\n' "$label" "$(wc -c < /tmp/smoke.html)"
  else
    printf 'FAIL  %-34s http=%s missing="%s"\n' "$label" "$code" "$needle"
    fails=$((fails + 1))
  fi
}

C="/coaching/$LBCL_CLUB"
expect "$C"                                             "club hub"                 "Squad"
expect "$C/opponents/cmucf1txo002pl3kkjut5me5r"          "opponent plan"            "Rotation for the last meeting"
expect "$C/players/cmucf1uf80069l3kk80zbmp1n"            "player plan + trend"      "Training trend"
expect "$C/training"                                     "training week"            "Assign an adopted plan"
expect "$C/training/cmvdp548w0000hvkkxd5hedor"           "training session"         "Complete this session"
expect "/players/cmucf1uf80069l3kk80zbmp1n/passport"     "athlete passport"         "Athlete passport"
expect "/players/cmucf1uf80069l3kk80zbmp1n/passport"     "passport provenance"      "IMPORTED"
expect "/scoresheets"                                    "scoresheets queue"        "Upload a sheet"
expect "/coaching/selection/cmuxu4gga00afyxkk1u12rua8"   "selection (normal)"       "Rotation"
expect "/coaching/selection/cmsp9a75d000m4pkk5achuyne"   "selection (insufficient)" "Insufficient games to generate a recommendation"

echo "-- service: $(systemctl is-active ultraos-staging-web.service)"
since=$(systemctl show -p ActiveEnterTimestamp --value ultraos-staging-web.service)
errors=$(journalctl -u ultraos-staging-web.service --since "$since" --no-pager 2>/dev/null | grep -cE '⨯|Error:' || true)
echo "-- errors since the service started this release: ${errors:-0}"
if [ "${errors:-0}" != "0" ]; then fails=$((fails + 1)); fi
if [ "$fails" -gt 0 ]; then echo "SMOKE FAILED ($fails)"; exit 1; fi
echo "SMOKE OK"
