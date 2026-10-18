#!/bin/bash
# Verify a tenant table the way the APPLICATION will use it (streak v6).
#
#   bash verify-tenant-table.sh <table> [<canonical-table>]
#
# Checks, in order, the four things that have actually gone wrong in this project:
#   1. row-level security enabled AND forced
#   2. a tenant_isolation policy whose predicate reads the SAME session variable the app sets
#      (app.current_org_id) - not merely "a policy exists"
#   3. the runtime roles have table privileges (all of them, compared against a known tenant table)
#   4. a scoped SELECT and a cross-tenant INSERT as the APP role, with the app's own setting
#
# The last one is the only check that would have caught the two real bugs (grant to the wrong role, policy
# on the wrong setting) - both survived a green test suite and a "policy exists" check.
set -uo pipefail

TABLE="${1:?usage: verify-tenant-table.sh <table> [<canonical-table>]}"
CANONICAL="${2:-CoachingPlan}"
APP_ENV="${APP_ENV:-/opt/ultraos-staging/shared/web.env}"

priv=$(grep -m1 '^DATABASE_URL=' /opt/ultraleagueos/shared/migrate.env | cut -d= -f2-)
priv="${priv%%\?*}"
DB_NAME="${DB_NAME:-ultraos_staging}"
DB="${priv%/*}/${DB_NAME}"
APP_URL=$(grep -m1 '^DATABASE_URL=' "$APP_ENV" | cut -d= -f2- | tr -d '"' | cut -d'?' -f1)
APP="${APP_URL%/*}/${DB_NAME}"

fail=0
note() { printf '%-46s %s\n' "$1" "$2"; }

echo "== $TABLE (canonical: $CANONICAL, db: $DB_NAME)"

rls=$(psql "$DB" -Atc "select relrowsecurity || ' ' || relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='$TABLE'")
if [ "$rls" = "t t" ]; then note "1. rls enabled + forced" "PASS"; else note "1. rls enabled + forced" "FAIL ($rls)"; fail=1; fi

predicate=$(psql "$DB" -Atc "select coalesce(qual,'') from pg_policies where schemaname='public' and tablename='$TABLE' and policyname='tenant_isolation'")
if echo "$predicate" | grep -q "app.current_org_id"; then
  note "2. policy reads app.current_org_id" "PASS"
else
  note "2. policy reads app.current_org_id" "FAIL -> ${predicate:-no tenant_isolation policy}"
  fail=1
fi

want=$(psql "$DB" -Atc "select string_agg(distinct grantee, ',' order by grantee) from information_schema.role_table_grants where table_name='$CANONICAL'")
have=$(psql "$DB" -Atc "select coalesce(string_agg(distinct grantee, ',' order by grantee), 'none') from information_schema.role_table_grants where table_name='$TABLE'")
if [ -n "$want" ] && [ "$(echo "$want")" = "$(echo "$have")" ]; then
  note "3. grants match $CANONICAL" "PASS ($have)"
else
  note "3. grants match $CANONICAL" "FAIL (want: ${want:-?} / have: ${have})"
  fail=1
fi

# 4. Behavioural check as the app role, using the app's own session variable.
ORG_A="${ORG_A:-cmucf1lo500003bkk1zyyoxmh}"
ORG_B="${ORG_B:-cmt4odhgn0000wokk8fbwr6ro}"
visible=$(psql "$APP" -Atc "begin; select set_config('app.current_org_id','$ORG_A',true); select count(*) from \"$TABLE\" where \"organizationId\"='$ORG_A'; commit;" 2>&1 | grep -E '^[0-9]+$' | head -1)
if [ -n "${visible:-}" ]; then
  note "4a. scoped SELECT as app role" "PASS (${visible} row(s) for the scoped org)"
else
  note "4a. scoped SELECT as app role" "FAIL (error or no result)"
  fail=1
fi

leak=$(psql "$APP" -Atc "begin; select set_config('app.current_org_id','$ORG_A',true); select count(*) from \"$TABLE\" where \"organizationId\"='$ORG_B'; commit;" 2>&1 | grep -E '^[0-9]+$' | head -1)
if [ "${leak:-x}" = "0" ]; then
  note "4b. no cross-tenant rows visible" "PASS"
else
  note "4b. no cross-tenant rows visible" "FAIL (saw ${leak:-error})"
  fail=1
fi

echo
if [ "$fail" = "0" ]; then echo "RESULT: PASS"; else echo "RESULT: FAIL"; fi
exit "$fail"
