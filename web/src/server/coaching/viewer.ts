import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";
import type { CoachingViewer } from "@/lib/coaching/access";

// Builds the plain CoachingViewer (lib/coaching/access.ts) from a session. Reads only; the access
// decision itself stays in the pure functions. Anonymous sessions have no viewer (null).
//
// UserRoleAssignment and User are platform-level. Staff and SeasonClub are tenant tables, so the
// coached-club lookup runs inside each ACTIVE organization's context rather than on the bare
// client (which would silently resolve to the legacy default organization). There are only a
// handful of organizations; if that ever grows, narrow the list to the user's role organizations.

export type CoachingSession = { user?: { email?: string | null } | null } | null | undefined;

async function inOrganization<T>(client: PrismaClient, organizationId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return client.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_org_id', ${organizationId}, true)`;
    return fn(tx);
  });
}

export async function loadCoachingViewer(session: CoachingSession, client: PrismaClient = defaultPrisma): Promise<CoachingViewer | null> {
  const email = session?.user?.email?.trim();
  if (!email) return null;

  const user = await client.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) return { email, roleAssignments: [], coachedSeasonClubs: [] };

  const roleAssignments = await client.userRoleAssignment.findMany({
    where: { userId: user.id, revokedAt: null },
    select: { role: true, organizationId: true },
  });

  const organizations = await client.organization.findMany({ where: { status: "ACTIVE" }, select: { id: true } });
  const coachedSeasonClubs: { seasonClubId: string; organizationId: string }[] = [];
  for (const organization of organizations) {
    const found = await inOrganization(client, organization.id, async (tx) => {
      const staff = await tx.staff.findFirst({ where: { userId: user.id, organizationId: organization.id }, select: { id: true } });
      if (!staff) return [];
      return tx.seasonClub.findMany({
        where: { organizationId: organization.id, OR: [{ headCoachId: staff.id }, { assistantCoachId: staff.id }] },
        select: { id: true, organizationId: true },
      });
    });
    for (const club of found) coachedSeasonClubs.push({ seasonClubId: club.id, organizationId: club.organizationId });
  }

  return { email, roleAssignments, coachedSeasonClubs };
}
