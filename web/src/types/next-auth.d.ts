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
  }

  interface Session {
    user: {
      id: string;
      role: UserRole;
      roles: UserRole[];
      organizationId: string | null;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
    roles: UserRole[];
    organizationId: string | null;
  }
}
