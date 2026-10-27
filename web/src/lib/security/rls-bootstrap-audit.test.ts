import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

// The RLS bootstrap audit (streak v23, Prompt 2).
//
// WHAT THIS GUARDS. Two bugs in two streaks had the same shape: a read of an RLS-FORCED table that happens BEFORE any
// tenant context exists, so the policy silently resolves to the platform default organization and the answer is wrong for
// every other league.
//
//   1. `resolveActiveOrganizationId()` saw no memberships outside the default organization -> every league's admin signed
//      in with organizationId: null and every page said "No league yet".
//   2. `getSessionUser()` saw no ROLE grants outside it -> roles came back empty, the code fell back to the legacy
//      User.role column, and a league operator signed in as a platform SUPER_ADMIN (a privilege escalation).
//
// Both were fixed with SECURITY DEFINER functions. This test does not re-run the database (the dynamic half lives in
// src/server/security/rls-bootstrap.test.ts, which needs a database); it asserts the SOURCE still uses those functions and
// has not quietly regressed to a bare Prisma read. It is deliberately a ratchet: if someone re-adds a direct read to one
// of these modules, this fails and points at the migration that explains why.
function source(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

/** Comments describe the pattern this test forbids, so they must not count as instances of it. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const authSource = source("auth.ts");
const tenantSource = source("lib/tenant-context.ts");
const apiKeySource = source("lib/api-v1/api-keys.ts");

test("getSessionUser resolves roles through app_resolve_user_roles, not through the RLS-scoped relation", () => {
  assert.match(authSource, /app_resolve_user_roles\(\$\{user\.id\}\)/, "auth.ts must call the SECURITY DEFINER function");
  // The include is still fine for `name/email/image`; what must NOT exist is roles coming from it. The session-shaped
  // read narrows `roles` to the relation only as a FALLBACK when the function returns nothing.
  // The fallback must go to the legacy column, never to the RLS-blind relation (that fallback WAS the escalation).
  assert.match(authSource, /resolvedRoles\.length > 0 \? resolvedRoles : \[user\.role\]/, "the fallback must be the legacy column");
  assert.doesNotMatch(authSource, /resolvedRoles\.length > 0 \? resolvedRoles : user\.roles\.map/, "a fallback through the relation is the v22 bug");
});

test("resolveActiveOrganizationId resolves membership through app_resolve_user_organization", () => {
  assert.match(tenantSource, /app_resolve_user_organization\(\$\{userId\}\)/, "tenant-context.ts must call the SECURITY DEFINER function");
});

test("API key authentication resolves keys through resolve_api_key", () => {
  assert.match(apiKeySource, /SELECT id, organization_id, tier FROM resolve_api_key\(/, "api-keys.ts must use the SECURITY DEFINER function");
  assert.doesNotMatch(apiKeySource, /prisma\.apiKey\.findFirst/, "a bare ApiKey read here would only see the default organization");
});

test("the sign-in path scopes its FAN grant to a resolved organization, not a hardcoded slug", () => {
  assert.match(authSource, /resolveDefaultPublicOrganization\(\)/, "the default organization must come from the helper");
  assert.doesNotMatch(authSource, /slug: "neon-ultra"/, 'a hardcoded "neon-ultra" in the sign-in path cannot survive a second tenant');
  assert.match(authSource, /withOrganizationContext\(organization\.id, \(tx\) =>\s*upsertRoleAssignment\(tx,/, "the grant insert must run inside the tenant context");
});

test("no bootstrap module reads a tenant table outside the context (a coarse ratchet)", () => {
  // Known-safe exceptions, each with its reason:
  //   * prisma.organization / prisma.user  - global tables, no RLS policy;
  //   * prisma.$queryRaw`SELECT app_resolve_*` - the SECURITY DEFINER functions themselves.
  const bootstrapModules = [
    { name: "auth.ts", source: stripComments(authSource) },
    { name: "lib/tenant-context.ts", source: stripComments(tenantSource) },
  ];
  const tenantModels = [
    "userRoleAssignment", "gameControlGrant", "competition", "fixture", "athlete", "player", "standing",
    "application", "season", "seasonClub", "club", "mediaAsset", "order", "apiKey", "auditLog",
  ];
  for (const candidate of bootstrapModules) {
    for (const model of tenantModels) {
      const directRead = new RegExp(`prisma\\.${model}\\.(findFirst|findMany|findUnique|count|aggregate|groupBy)`);
      const match = directRead.exec(candidate.source);
      // A read inside a `withOrganizationContext(` callback is fine; this ratchet only trips on the module-level client.
      if (match) {
        const contextBefore = candidate.source.lastIndexOf("withOrganizationContext(", match.index);
        const insideCallback = contextBefore > 0 && match.index - contextBefore < 400;
        assert.ok(
          insideCallback,
          `${candidate.name} reads prisma.${model} outside withOrganizationContext - an RLS-forced table read at bootstrap ` +
            "sees only the platform default organization (see migrations 20261028160000 and 20261028170000)",
        );
      }
    }
  }
});
