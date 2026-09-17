import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { userHasGameControlPermission } from "@/lib/game-access";
import { hasPermission, type Permission } from "@/lib/permissions";
import { userHasPlatformPermission } from "@/lib/platform-permissions";
import { withOrganizationContext } from "@/lib/tenant-context";

export class AuthenticationError extends Error {
  constructor() {
    super("Authentication required.");
    this.name = "AuthenticationError";
  }
}

export class AuthorizationError extends Error {
  constructor(permission: Permission) {
    super(`Missing required permission: ${permission}`);
    this.name = "AuthorizationError";
  }
}

// Phase 1 Stage 5.2: should not occur for an active real account (every existing user was
// backfilled in Stage 5.1, and every new sign-up gets an org-scoped grant) - thrown rather than
// silently falling back to Neon Ultra, since a mutating action must never guess which
// organization it's operating in.
export class MissingOrganizationContextError extends Error {
  constructor() {
    super("Signed-in user has no resolved organization context.");
    this.name = "MissingOrganizationContextError";
  }
}

// Cross-org relation guard (Part of Stage 5.2's design): RLS already makes a different
// organization's row invisible, so a lookup against it returns null/not-found on its own - this
// helper exists purely to turn that into a clear, explicit error at the point of use rather than
// letting it fall through to a generic "not found" a caller might misdiagnose as a typo'd id.
export function assertSameOrganization(entity: { organizationId: string } | null | undefined, organizationId: string, label: string): asserts entity is { organizationId: string } {
  if (!entity) {
    throw new Error(`${label} not found.`);
  }
  if (entity.organizationId !== organizationId) {
    throw new Error(`${label} does not belong to your organization.`);
  }
}

export async function requireSession() {
  const session = await auth();
  if (!session?.user) {
    throw new AuthenticationError();
  }

  return session;
}

export async function requirePermission(permission: Permission) {
  const session = await requireSession();
  if (!hasPermission(session.user.roles, permission)) {
    throw new AuthorizationError(permission);
  }

  return session;
}

// Phase 1 Stage 5.2D: platform-global diagnostics cannot rely on session role names.
// The same role name may be granted inside one organization, so platform operations require a
// persisted, active UserRoleAssignment with organizationId = null whose role grants the requested
// permission. This preserves organization-scoped semantics for the rest of the application.
export async function requirePlatformPermission(permission: Permission) {
  const session = await requireSession();
  const { prisma } = await import("@/lib/prisma");
  if (!(await userHasPlatformPermission(session.user.id, permission, prisma))) {
    throw new AuthorizationError(permission);
  }

  return session;
}

// Phase 1 Stage 5.2: the entry point every tenant-scoped mutation should use instead of
// requirePermission() alone - resolves and validates the acting organization in one place so
// individual actions never have to remember the null-check. organizationId always comes from the
// authenticated session (Stage 5.1's resolveActiveOrganizationId, resolved at sign-in) - never
// from request/form input, so a client can never simply pass a different organizationId to act
// as another tenant.
export async function requirePermissionWithOrganization(permission: Permission) {
  const session = await requirePermission(permission);
  if (!session.user.organizationId) {
    throw new MissingOrganizationContextError();
  }
  return { session, organizationId: session.user.organizationId };
}

// Same redirect-on-anonymous behavior as requirePermissionOrRedirect, for pages that also need the
// resolved organization context (Stage 5.2's requirePermissionWithOrganization).
export async function requirePermissionWithOrganizationOrRedirect(permission: Permission, loginRedirectTo: string) {
  try {
    return await requirePermissionWithOrganization(permission);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      redirect(`/login?callbackUrl=${encodeURIComponent(loginRedirectTo)}`);
    }
    throw error;
  }
}

// G.16, Part IV: requirePermission() throws AuthenticationError for a fully anonymous request,
// which Next.js renders as a generic 500 rather than a clean login redirect (documented as a
// G.15 P1 for /games/[fixtureId]/live and /games/[fixtureId]/stats). This wrapper redirects on
// the anonymous case specifically - an authenticated-but-unauthorized user still gets the
// existing AuthorizationError behavior unchanged, since that's a different, not-in-scope
// concern. Deliberately opt-in (not a change to requirePermission itself) so every other page
// already relying on requirePermission's current behavior is unaffected.
export async function requirePermissionOrRedirect(permission: Permission, loginRedirectTo: string) {
  try {
    return await requirePermission(permission);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      redirect(`/login?callbackUrl=${encodeURIComponent(loginRedirectTo)}`);
    }
    throw error;
  }
}

// For pages a lower-privilege, single-purpose role should be able to reach without also being
// granted a broader role's permissions - e.g. a check-in-only volunteer (check-in:operate)
// shouldn't need game:operate just to open the check-in station.
export async function requireAnyPermission(permissions: Permission[]) {
  const session = await requireSession();
  if (!permissions.some((permission) => hasPermission(session.user.roles, permission))) {
    throw new AuthorizationError(permissions[0]);
  }

  return session;
}

// Same redirect-on-anonymous behavior as requirePermissionOrRedirect, for pages gated behind
// requireAnyPermission instead of a single permission.
export async function requireAnyPermissionOrRedirect(permissions: Permission[], loginRedirectTo: string) {
  try {
    return await requireAnyPermission(permissions);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      redirect(`/login?callbackUrl=${encodeURIComponent(loginRedirectTo)}`);
    }
    throw error;
  }
}

// Scoped game control (see lib/game-access.ts). A person running the table for one tournament, season
// or event should not need a league-wide role: a GameControlGrant matching the fixture's scope grants
// that role's permissions for those games only. Organization-wide roles are checked first, so the
// common case never touches the database.
async function userHasFixturePermission(
  session: Awaited<ReturnType<typeof requireSession>>,
  organizationId: string,
  fixtureId: string,
  permission: Permission,
): Promise<boolean> {
  if (hasPermission(session.user.roles, permission)) return true;

  return withOrganizationContext(organizationId, async (tx) => {
    const fixture = await tx.fixture.findFirst({
      where: { id: fixtureId, organizationId },
      select: { eventId: true, seasonId: true, division: { select: { competitionId: true } } },
    });
    if (!fixture) return false;

    return userHasGameControlPermission(
      session.user.id,
      organizationId,
      {
        eventId: fixture.eventId,
        seasonId: fixture.seasonId,
        competitionId: fixture.division.competitionId,
      },
      permission,
      tx,
    );
  });
}

// The fixture-aware counterpart of requirePermissionWithOrganization: use it for anything that
// operates a specific game (scoring, stats, confirming results), so event staff are honoured without
// widening their permissions to the whole organization.
export async function requireFixturePermission(permission: Permission, fixtureId: string) {
  const session = await requireSession();
  const organizationId = session.user.organizationId;
  if (!organizationId) {
    throw new MissingOrganizationContextError();
  }
  const allowed = await userHasFixturePermission(session, organizationId, fixtureId, permission);
  if (!allowed) {
    throw new AuthorizationError(permission);
  }
  return { session, organizationId };
}

// Non-throwing form, for deciding which controls a console should render. Falls back to the
// organization-wide role check, so it is safe to call without a fixture for the common case.
export async function canFixturePermission(permission: Permission, fixtureId: string): Promise<boolean> {
  const session = await requireSession();
  const organizationId = session.user.organizationId;
  if (!organizationId) return false;
  return userHasFixturePermission(session, organizationId, fixtureId, permission);
}

// Same redirect-on-anonymous behavior as requirePermissionOrRedirect, for fixture-scoped pages.
export async function requireFixturePermissionOrRedirect(
  permission: Permission,
  fixtureId: string,
  loginRedirectTo: string,
) {
  try {
    return await requireFixturePermission(permission, fixtureId);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      redirect(`/login?callbackUrl=${encodeURIComponent(loginRedirectTo)}`);
    }
    throw error;
  }
}
