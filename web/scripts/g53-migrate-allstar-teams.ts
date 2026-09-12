import { writeAuditLog } from "../src/lib/audit";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const EVENT_ID = "seed-event-season-zero-launch";
const VENUE_ID = "cmqfqpnsb001ilgkkwq13sr5s";
const ORGANIZATION_ID = "cmt4odhgn0000wokk8fbwr6ro"; // Neon Ultra Basketball League

async function main() {
  const settings = await prisma.systemSetting.findMany({ where: { key: { in: ["all-star-team:zenith", "all-star-team:pulse"] } } });
  const teamIds: Record<string, string> = {};

  for (const setting of settings) {
    const value = setting.value as { name: string };
    const existing = await prisma.noveltyTeam.findFirst({ where: { name: value.name } });
    if (existing) {
      teamIds[value.name] = existing.id;
      console.log(`${value.name}: already migrated -> ${existing.id}`);
      continue;
    }
    const team = await prisma.$transaction(async (tx) => {
      const created = await tx.noveltyTeam.create({
        data: { organizationId: ORGANIZATION_ID, description: "Season Zero All-Star exhibition team.", name: value.name, shortName: value.name },
      });
      await writeAuditLog(tx, {
        action: "NOVELTY_TEAM_CREATED",
        details: { migratedFrom: setting.key, name: value.name },
        entityId: created.id,
        entityType: "NoveltyTeam",
        userId: ACTOR_ID,
      });
      return created;
    });
    teamIds[value.name] = team.id;
    console.log(`${value.name}: created -> ${team.id}`);
  }

  const zenithId = teamIds["Zenith"];
  const pulseId = teamIds["Pulse"];
  if (!zenithId || !pulseId) throw new Error("Could not resolve both Zenith and Pulse NoveltyTeam ids.");

  const existingMatch = await prisma.noveltyMatch.findFirst({ where: { homeTeamId: zenithId, awayTeamId: pulseId } });
  if (existingMatch) {
    console.log("Exhibition match already exists:", existingMatch.id);
    return;
  }

  const match = await prisma.$transaction(async (tx) => {
    const created = await tx.noveltyMatch.create({
      data: {
        awayTeamId: pulseId,
        eventId: EVENT_ID,
        homeTeamId: zenithId,
        name: "Season Zero All-Star Exhibition",
        scheduledAt: new Date("2026-08-15T18:30:00+01:00"),
        venueId: VENUE_ID,
      },
    });
    await writeAuditLog(tx, {
      action: "NOVELTY_MATCH_CREATED",
      details: { awayTeamId: pulseId, homeTeamId: zenithId, name: created.name, scheduledAt: created.scheduledAt.toISOString() },
      entityId: created.id,
      entityType: "NoveltyMatch",
      userId: ACTOR_ID,
    });
    return created;
  });
  console.log("Created exhibition match:", match.id, "at", match.scheduledAt.toISOString());
}

main().finally(() => prisma.$disconnect());
