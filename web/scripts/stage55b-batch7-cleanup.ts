// Stage 5.5B Batch 7 proof cleanup utility. Restricted-role, long-timeout, prefix-scoped.
// Deletes only disposable Batch 7 fixture data. Never deletes real org/user rows.
import { Prisma } from "../src/generated/prisma/client";
import { prisma } from "../src/lib/prisma";

async function withLong<T>(orgId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_org_id', ${orgId}, true)`;
    return fn(tx);
  }, { timeout: 180000, maxWait: 30000 });
}

async function cleanOrg(orgId: string) {
  await withLong(orgId, async (tx) => {
    await tx.auditLog.deleteMany({ where: { organizationId: orgId } });
    await tx.game.deleteMany({ where: { organizationId: orgId } });
    await tx.fixture.deleteMany({ where: { organizationId: orgId } });
    await tx.operationalChecklistItem.deleteMany({ where: { organizationId: orgId } });
    await tx.operationalChecklist.deleteMany({ where: { organizationId: orgId } });
    await tx.runbookTask.deleteMany({ where: { organizationId: orgId } });
    await tx.runbook.deleteMany({ where: { organizationId: orgId } });
    await tx.application.deleteMany({ where: { organizationId: orgId } });
    await tx.incident.deleteMany({ where: { organizationId: orgId } });
    await tx.opsNotification.deleteMany({ where: { organizationId: orgId } });
    await tx.opsDocument.deleteMany({ where: { organizationId: orgId } });
    await tx.opsTask.deleteMany({ where: { organizationId: orgId } });
    await tx.rehearsal.deleteMany({ where: { organizationId: orgId } });
    await tx.equipment.deleteMany({ where: { organizationId: orgId } });
    await tx.displayHeartbeat.deleteMany({ where: { organizationId: orgId } });
    await tx.systemSetting.deleteMany({ where: { organizationId: orgId } });
    await tx.player.deleteMany({ where: { organizationId: orgId } });
    await tx.athlete.deleteMany({ where: { organizationId: orgId } });
    await tx.seasonClub.deleteMany({ where: { organizationId: orgId } });
    await tx.staff.deleteMany({ where: { organizationId: orgId } });
    await tx.club.deleteMany({ where: { organizationId: orgId } });
    await tx.venue.deleteMany({ where: { organizationId: orgId } });
    await tx.season.deleteMany({ where: { organizationId: orgId } });
    await tx.division.deleteMany({ where: { organizationId: orgId } });
    await tx.competition.deleteMany({ where: { organizationId: orgId } });
    await tx.publicIdCounter.deleteMany({ where: { organizationId: orgId } });
    await tx.publicResourceLocator.deleteMany({ where: { organizationId: orgId } });
    await tx.publicTokenLocator.deleteMany({ where: { organizationId: orgId } });
  });
  await prisma.organization.delete({ where: { id: orgId } });
}

async function main() {
  const orgs = await prisma.organization.findMany({ where: { slug: { startsWith: "stage55b-batch7-" } }, select: { id: true, slug: true } });
  for (const org of orgs) {
    await cleanOrg(org.id);
    console.log(`cleaned org ${org.slug}`);
  }
  const users = await prisma.user.deleteMany({ where: { email: { startsWith: "stage55b-batch7-" } } });
  console.log(`deleted users ${users.count}`);

  const neon = await prisma.organization.findUnique({ where: { slug: "neon-ultra" } });
  if (neon) {
    await withLong(neon.id, async (tx) => {
      const athletes = await tx.athlete.findMany({ where: { ultraAthleteId: { startsWith: "B7-WW-" } }, select: { id: true } });
      for (const athlete of athletes) {
        const players = await tx.player.findMany({ where: { athleteId: athlete.id }, select: { id: true } });
        for (const player of players) {
          const announcements = await tx.announcement.findMany({ where: { playerId: player.id }, select: { id: true } });
          for (const announcement of announcements) {
            await tx.wellWish.deleteMany({ where: { announcementId: announcement.id } });
          }
          await tx.announcement.deleteMany({ where: { playerId: player.id } });
        }
        await tx.player.deleteMany({ where: { athleteId: athlete.id } });
      }
      await tx.athlete.deleteMany({ where: { ultraAthleteId: { startsWith: "B7-WW-" } } });
    });
  }
  console.log(`remaining batch7 orgs ${await prisma.organization.count({ where: { slug: { startsWith: "stage55b-batch7-" } } })}`);
  console.log(`remaining batch7 users ${await prisma.user.count({ where: { email: { startsWith: "stage55b-batch7-" } } })}`);
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
