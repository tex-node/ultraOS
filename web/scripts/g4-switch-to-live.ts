import { writeAuditLog } from "../src/lib/audit";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const DRAFT_EVENT_ID = "cmsmoolbl0000rckk9wr5cezj";

async function main() {
  const before = await prisma.draftEvent.findUniqueOrThrow({ where: { id: DRAFT_EVENT_ID } });
  if (before.operatingMode !== "REHEARSAL") throw new Error(`Refusing: expected operatingMode REHEARSAL, found ${before.operatingMode}`);

  const rehearsalAllocs = await prisma.draftAllocation.count({ where: { draftEventId: DRAFT_EVENT_ID } });
  if (rehearsalAllocs !== 0) throw new Error(`Refusing: ${rehearsalAllocs} DraftAllocation rows still exist for this event.`);

  const after = await prisma.$transaction(async (tx) => {
    const updated = await tx.draftEvent.update({
      where: { id: DRAFT_EVENT_ID },
      data: { operatingMode: "LIVE" },
    });
    await writeAuditLog(tx, {
      action: "DRAFT_EVENT_OPERATING_MODE_SWITCHED_TO_LIVE",
      details: {
        draftEventId: DRAFT_EVENT_ID,
        previousMode: before.operatingMode,
        newMode: "LIVE",
        reason: "Season Zero Draft Day final go-live activation after successful Track G.3 production rehearsal and Track G.4 final readiness gate.",
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
