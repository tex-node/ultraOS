import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

// Phase 1 Stage 5.1: real organization resolution for a signed-in user - the piece Stage 0-4b
// deliberately deferred. Picks the first non-revoked, org-scoped role grant. A user with zero
// org-scoped grants (only platform-level roles) resolves to null - callers must decide what that
// means for them (today, every real user has been backfilled to Neon Ultra - see
// scripts/phase1-stage5-backfill-role-organization.ts - so null here should not occur for an
// active account; it is not silently mapped to a default).
export async function resolveActiveOrganizationId(userId: string): Promise<string | null> {
  const membership = await prisma.userRoleAssignment.findFirst({
    where: { userId, organizationId: { not: null }, revokedAt: null },
    select: { organizationId: true },
    orderBy: { grantedAt: "asc" },
  });
  return membership?.organizationId ?? null;
}

export class OrganizationNotFoundError extends Error {
  constructor(slug: string) {
    super(`No active league found for "${slug}".`);
    this.name = "OrganizationNotFoundError";
  }
}

// Phase 1 Stage 5.2B-1: the trusted org-acquisition mechanism for UNAUTHENTICATED / not-yet-
// org-member flows (public applications, invite links) - resolved from a server-controlled route
// segment (e.g. /apply/[organizationSlug]), never from session membership (a signed-in user's
// existing org membership is a different concept from which org they're applying to - see
// PHASE1_STAGE5_2A_TENANCY_SCAN.md's PUBLIC_APPLICATION_TENANT_RESOLUTION note) and never from a
// client-supplied organizationId. Throws (never falls back to a default) for an unknown or
// inactive slug, since silently resolving to "some" organization here would be exactly the kind
// of guess this mechanism exists to prevent.
export async function resolveActiveOrganizationBySlug(slug: string) {
  const organization = await prisma.organization.findUnique({ where: { slug } });
  if (!organization || organization.status !== "ACTIVE") {
    throw new OrganizationNotFoundError(slug);
  }
  return organization;
}

// Phase 1 Stage 5.2D, Pattern D (INTENTIONAL_NEON_ULTRA_DEFAULT): the public website's core
// browsing routes (/public/clubs, /public/standings, /public/stats, etc.) carry no organization
// slug and were never designed to - this product began, and today remains, a single-league
// public site. Before this stage every one of those routes ran on the bare `prisma` client and
// "worked" only because RLS's unset-context fallback happens to resolve to Neon Ultra - an
// architectural dependency on the temporary bridge, not a real tenant-acquisition decision (see
// withOrganizationContext's own doc comment on that fallback). This helper makes the same
// destination explicit and intentional instead: it resolves Neon Ultra by its real slug through
// the already-established 5.2B-1 mechanism, and every call site wraps its reads in
// withOrganizationContext() with the result - so the public site's tenant is now a documented
// decision, not a side effect of an unset session variable. If this product ever needs a second
// organization's own public site, that is a new URL pattern (Pattern A, an explicit
// organizationSlug segment) built alongside this one - not a reason to change what this function
// resolves.
const NEON_ULTRA_PUBLIC_SITE_SLUG = "neon-ultra";

export async function resolveDefaultPublicOrganization() {
  return resolveActiveOrganizationBySlug(NEON_ULTRA_PUBLIC_SITE_SLUG);
}

// The one place `app.current_org_id` ever gets set. Uses `set_config(..., true)` (the
// parameterized equivalent of `SET LOCAL`) rather than string-interpolated `SET LOCAL`, both to
// avoid SQL injection and because Prisma's tagged-template $executeRaw only parameterizes actual
// query parameters, not raw SQL identifiers/keywords. `true` makes the setting transaction-local
// - it is automatically reset when the transaction commits or rolls back, so a pooled connection
// handed back to Prisma's pool can never carry one request's organization into another request.
// This is why every tenant-scoped query MUST go through this wrapper rather than calling
// `prisma.<model>.*` directly once Stage 5.2 lands - a bare `prisma.club.findMany()` runs outside
// any transaction and therefore outside any org context, which the RLS fallback would silently
// resolve to Neon Ultra rather than failing loudly. That silent-fallback risk is exactly why
// Stage 5.5 cannot remove the Neon Ultra DB default until this wrapper is used everywhere.
export async function withOrganizationContext<T>(
  organizationId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_org_id', ${organizationId}, true)`;
    return fn(tx);
  });
}
