import { writeAuditLog } from "../src/lib/audit";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const DRAFT_EVENT_ID = "cmsmoolbl0000rckk9wr5cezj";

async function main() {
  const before = await prisma.draftEvent.findUniqueOrThrow({ where: { id: DRAFT_EVENT_ID } });
  if (before.operatingMode !== "LIVE") throw new Error(`Refusing: expected operatingMode LIVE, found ${before.operatingMode}`);

  const liveAllocs = await prisma.draftAllocation.count({ where: { draftEventId: DRAFT_EVENT_ID, operatingMode: "LIVE" } });
  if (liveAllocs !== 0) throw new Error(`Refusing: ${liveAllocs} LIVE DraftAllocation rows exist — this would be a real rollback, not a pre-event mode reset.`);

  const after = await prisma.$transaction(async (tx) => {
    const updated = await tx.draftEvent.update({
      where: { id: DRAFT_EVENT_ID },
      data: { operatingMode: "REHEARSAL" },
    });
    await writeAuditLog(tx, {
      action: "DRAFT_EVENT_OPERATING_MODE_SWITCHED_TO_REHEARSAL",
      details: {
        draftEventId: DRAFT_EVENT_ID,
        previousMode: before.operatingMode,
        newMode: "REHEARSAL",
        reason: "Administrator explicitly requested another rehearsal run before Draft Day. No LIVE allocations existed at the time of this switch.",
      },
      entityId: DRAFT_EVENT_ID,
      entityType: "DraftEvent",
      userId: ACTOR_ID,
    });
    return updated;
  });

  console.log(JSON.stringify({ before: { operatingMode: before.operatingMode, status: before.status, currentStage: before.currentStage }, after: { operatingMode: after.operatingMode, status: after.status, currentStage: after.currentStage } }, null, 2));
}

main().finally(() => prisma.$disconnect());
