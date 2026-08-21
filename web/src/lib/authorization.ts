import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { hasPermission, type Permission } from "@/lib/permissions";

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
