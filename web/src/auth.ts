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
import { resolveActiveOrganizationId } from "@/lib/tenant-context";

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

  const roles = user.roles.map((assignment) => assignment.role);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    role: primaryRole(roles.length > 0 ? roles : [user.role]),
    roles: roles.length > 0 ? roles : [user.role, UserRole.FAN],
    organizationId: await resolveActiveOrganizationId(user.id),
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
  const organization = await prisma.organization.findUnique({ where: { slug: "neon-ultra" } });
  await upsertRoleAssignment(prisma, {
    userId: createdOrUpdated.id,
    role: UserRole.FAN,
    organizationId: organization?.id ?? null,
  });

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
          token.sessionVersion = sessionUser.sessionVersion;
        }
        return token;
      }

      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.roles = user.roles;
        token.organizationId = user.organizationId;
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
      return session;
    },
  },
});
