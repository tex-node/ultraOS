import { DraftEventStage, DraftEventStatus } from "../src/generated/prisma/enums";
import { writeAuditLog } from "../src/lib/audit";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const DRAFT_EVENT_ID = "cmsmoolbl0000rckk9wr5cezj";
const REASON = "Main Season Zero Draft ceremony completed before Game Day.";

async function main() {
  const before = await prisma.draftEvent.findUniqueOrThrow({ where: { id: DRAFT_EVENT_ID } });
  if (before.status === "COMPLETED") {
    console.log("Already COMPLETED. No action taken.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    const updated = await tx.draftEvent.update({
      where: { id: DRAFT_EVENT_ID },
      data: {
        completedAt: new Date(),
        currentStage: DraftEventStage.COMPLETED,
        status: DraftEventStatus.COMPLETED,
        displaySequence: { increment: 1 },
      },
    });
    await writeAuditLog(tx, {
      action: "DRAFT_EVENT_COMPLETED",
      entityId: DRAFT_EVENT_ID,
      entityType: "DraftEvent",
      userId: ACTOR_ID,
      details: {
        reason: REASON,
        previousStatus: before.status,
        previousStage: before.currentStage,
        totalConfirmedAllocations: await tx.draftAllocation.count({ where: { draftEventId: DRAFT_EVENT_ID, status: "CONFIRMED" } }),
        nonConfirmedAllocations: await tx.draftAllocation.count({ where: { draftEventId: DRAFT_EVENT_ID, status: { not: "CONFIRMED" } } }),
      },
    });
    console.log("Updated:", { status: updated.status, currentStage: updated.currentStage, completedAt: updated.completedAt });
  });
}

main().finally(() => prisma.$disconnect());
