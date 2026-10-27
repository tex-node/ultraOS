import type { DefaultSession } from "next-auth";
import type { UserRole } from "@/generated/prisma/enums";

declare module "next-auth" {
  interface User {
    role: UserRole;
    roles: UserRole[];
    // Phase 1 Stage 5.1: resolved via resolveActiveOrganizationId() at sign-in - null only for
    // an account with no org-scoped role grant (should not occur for an active real user; see
    // tenant-context.ts's doc comment).
    organizationId: string | null;
    // Streak v23: the league's OWN name and slug, so a shell can print it instead of a hardcoded "Neon Ultra".
    // Organization is the tenant table itself (not RLS-scoped), so this is a cheap read after the id is known.
    organizationName: string | null;
    organizationSlug: string | null;
    // Session version carried at sign-in; checked against the row on every page load so a
    // password change signs out every other device (see lib/session-version.ts).
    sessionVersion: number;
  }

  interface Session {
    user: {
      id: string;
      role: UserRole;
      roles: UserRole[];
      organizationId: string | null;
      organizationName: string | null;
      organizationSlug: string | null;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
    roles: UserRole[];
    organizationId: string | null;
    organizationName?: string | null;
    organizationSlug?: string | null;
    // Carried at sign-in; checked against the user's row on every page load.
    sessionVersion?: number;
  }
}
