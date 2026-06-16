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
