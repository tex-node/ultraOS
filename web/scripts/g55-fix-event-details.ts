import { writeAuditLog } from "../src/lib/audit";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const EVENT_ID = "seed-event-season-zero-launch";
const SPONSOR_ID = "seed-campaign-refresh-season-zero";

async function main() {
  const before = await prisma.event.findUniqueOrThrow({ where: { id: EVENT_ID } });
  await prisma.$transaction(async (tx) => {
    await tx.event.update({
      where: { id: EVENT_ID },
      data: {
        doorsOpenTime: new Date("2026-08-15T10:30:00+01:00"),
        startTime: new Date("2026-08-15T11:30:00+01:00"),
      },
    });
    await tx.sponsorCampaign.update({ where: { id: SPONSOR_ID }, data: { isActive: false } });
    await writeAuditLog(tx, {
      action: "EVENT_DETAILS_CORRECTED",
      details: {
        newDoorsOpenTime: "2026-08-15T10:30:00+01:00",
        newStartTime: "2026-08-15T11:30:00+01:00",
        oldDoorsOpenTime: before.doorsOpenTime?.toISOString(),
        oldStartTime: before.startTime.toISOString(),
        reason: "Start time corrected to match the real first fixture (11:30am WAT); placeholder sponsor 'Refresh Beverages' deactivated.",
        sponsorDeactivated: SPONSOR_ID,
      },
      entityId: EVENT_ID,
      entityType: "Event",
      userId: ACTOR_ID,
    });
  });
  console.log("Event start/doors-open time corrected; placeholder sponsor deactivated.");
}

main().finally(() => prisma.$disconnect());
