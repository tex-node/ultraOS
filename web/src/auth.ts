import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { compare } from "bcryptjs";
import { z } from "zod";
import { UserRole } from "@/generated/prisma/enums";
import { primaryRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { sessionVersionMatches } from "@/lib/session-version";
import { upsertRoleAssignment } from "@/lib/user-roles";
import { resolveActiveOrganizationId, resolveDefaultPublicOrganization, withOrganizationContext } from "@/lib/tenant-context";

const credentialsSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  password: z.string().min(8),
});

async function getSessionUser(email: string) {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: {
      roles: {
        where: { revokedAt: null },
        select: { role: true },
      },
    },
  });

  if (!user?.isActive) {
    return null;
  }

  // The roles come from a SECURITY DEFINER function, not from the included relation (streak v22): UserRoleAssignment is
  // RLS-forced and this runs before any tenant context exists, so the include saw ONLY platform grants and roles outside
  // the default organization - every grant a real league operator holds - were invisible. `roles` came back empty and the
  // fallback below used the legacy `User.role` column, which for an account created as SUPER_ADMIN meant a league
  // operator signed in as a platform administrator. See migration 20261028170000.
  const resolvedRoles = await prisma
    .$queryRaw<{ roles: string[] | null }[]>`SELECT app_resolve_user_roles(${user.id}) AS roles`
    .then((rows) => rows[0]?.roles ?? [])
    .catch(() => [] as string[]);
  // No RLS-blind fallback: if the function returns nothing the user genuinely holds no grants, and the legacy column is
  // the only other source of truth. Reading the relation here would look like a fallback while silently seeing only the
  // default organization's grants, which is exactly how the v22 privilege escalation happened.
  const roles = (resolvedRoles.length > 0 ? resolvedRoles : [user.role]) as UserRole[];

  // The league's own name and slug, so a shell can print "Test League B" instead of a hardcoded "Neon Ultra" (streak
  // v23). Organization is the tenant table itself and is NOT RLS-scoped, so this read is safe before any context exists;
  // the id it needs comes from the SECURITY DEFINER resolver, which is the part that could not be a scoped query.
  const organizationId = await resolveActiveOrganizationId(user.id);
  const organization = organizationId
    ? await prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true, slug: true } })
    : null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    role: primaryRole(roles.length > 0 ? roles : [user.role]),
    roles: roles.length > 0 ? roles : [user.role, UserRole.FAN],
    organizationId,
    organizationName: organization?.name ?? null,
    organizationSlug: organization?.slug ?? null,
    sessionVersion: user.sessionVersion,
  };
}

async function upsertGoogleUser(user: { email?: string | null; name?: string | null; image?: string | null }) {
  if (!user.email) {
    return null;
  }

  const email = user.email.toLowerCase();
  const name = user.name?.trim() || email.split("@")[0];
  const createdOrUpdated = await prisma.user.upsert({
    where: { email },
    update: {
      name,
      image: user.image,
      isActive: true,
    },
    create: {
      name,
      email,
      image: user.image,
      role: UserRole.FAN,
      isActive: true,
      roles: {
        create: { role: UserRole.FAN },
      },
    },
    select: { id: true },
  });

  // Phase 1 Stage 5.1: every new sign-up becomes a Neon Ultra-scoped FAN, not a platform-level
  // one - there is exactly one organization today, and this is the org-resolution mechanism's
  // only source of truth (see resolveActiveOrganizationId). A genuinely platform-level grant
  // (organizationId: null) is reserved for accounts explicitly provisioned as cross-org
  // operators, never the default for an ordinary sign-up.
  // The default organization is resolved through the documented helper rather than a string literal buried in the sign-in
  // path (streak v23 audit), and the grant is written INSIDE its tenant context: UserRoleAssignment is RLS-FORCED, so the
  // insert only succeeded before because the hardcoded org happened to BE the policy's fallback default. Any other
  // organization would have been silently refused.
  const organization = await resolveDefaultPublicOrganization();
  await withOrganizationContext(organization.id, (tx) =>
    upsertRoleAssignment(tx, {
      userId: createdOrUpdated.id,
      role: UserRole.FAN,
      organizationId: organization.id,
    }),
  );

  return getSessionUser(email);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Google,
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
        });

        if (!user?.passwordHash || !user.isActive) {
          return null;
        }

        const isValid = await compare(parsed.data.password, user.passwordHash);
        if (!isValid) {
          return null;
        }

        return getSessionUser(user.email);
      },
    }),
  ],
  callbacks: {
    async signIn({ account, profile, user }) {
      if (account?.provider !== "google") {
        return true;
      }

      if (profile && "email_verified" in profile && profile.email_verified === false) {
        return false;
      }

      const sessionUser = await upsertGoogleUser(user);
      return Boolean(sessionUser);
    },
    async jwt({ token, user, account }) {
      if (account?.provider === "google" && user?.email) {
        const sessionUser = await getSessionUser(user.email);
        if (sessionUser) {
          token.id = sessionUser.id;
          token.role = sessionUser.role;
          token.roles = sessionUser.roles;
          token.organizationId = sessionUser.organizationId;
          token.organizationName = sessionUser.organizationName;
          token.organizationSlug = sessionUser.organizationSlug;
          token.sessionVersion = sessionUser.sessionVersion;
        }
        return token;
      }

      if (user) {
        // `user.id` is optional on NextAuth's own User type; our JWT declares it as a string. A token without an id
        // is unusable anyway (the session callback rejects it), so guard the assignment rather than casting.
        if (typeof user.id === "string") token.id = user.id;
        token.role = user.role;
        token.roles = user.roles;
        token.organizationId = user.organizationId;
        token.organizationName = user.organizationName;
        token.organizationSlug = user.organizationSlug;
        token.sessionVersion = typeof user.sessionVersion === "number" ? user.sessionVersion : 0;
      }
      return token;
    },
    async session({ session, token }) {
      if (
        !session.user ||
        typeof token.id !== "string" ||
        !Object.values(UserRole).includes(token.role as UserRole)
      ) {
        return session;
      }

      // Revocation on password change: the token is only valid while the version it carries
      // still matches the user's row. A mismatch means the password changed on another device
      // (or the account was otherwise rotated) - treat the session as signed out.
      const current = await prisma.user.findUnique({
        where: { id: token.id },
        select: { sessionVersion: true },
      });
      if (!current || !sessionVersionMatches({ sessionVersion: token.sessionVersion }, current.sessionVersion)) {
        return { ...session, user: undefined };
      }

      session.user.id = token.id;
      session.user.role = token.role as UserRole;
      session.user.roles = Array.isArray(token.roles)
        ? token.roles.filter((role): role is UserRole =>
            Object.values(UserRole).includes(role as UserRole),
          )
        : [token.role as UserRole];
      session.user.organizationId = typeof token.organizationId === "string" ? token.organizationId : null;
      session.user.organizationName = typeof token.organizationName === "string" ? token.organizationName : null;
      session.user.organizationSlug = typeof token.organizationSlug === "string" ? token.organizationSlug : null;
      return session;
    },
  },
});
