import { AllocationSubjectType, DraftEventStage } from "../src/generated/prisma/enums";
import { confirmAllocation, correctAllocation, reserveNextAllocation, revealAllocation } from "../src/lib/draft-events";
import { writeAuditLog } from "../src/lib/audit";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const DRAFT_EVENT_ID = "cmsmoolbl0000rckk9wr5cezj";
const WOMEN_DIVISION_ID = "cmqfqpnkl0004lgkkk2bjeqfm";

async function main() {
  await prisma.$transaction(async (tx) => {
    await tx.draftEvent.update({ where: { id: DRAFT_EVENT_ID }, data: { currentStage: DraftEventStage.WOMEN_COACH_ALLOCATION, displaySequence: { increment: 1 } } });
    await writeAuditLog(tx, { action: "DRAFT_EVENT_STAGE_CHANGED", entityId: DRAFT_EVENT_ID, entityType: "DraftEvent", userId: ACTOR_ID, details: { stage: "WOMEN_COACH_ALLOCATION" } });
  });

  const allocation = await reserveNextAllocation({ draftEventId: DRAFT_EVENT_ID, divisionId: WOMEN_DIVISION_ID, subjectType: AllocationSubjectType.COACH, userId: ACTOR_ID });
  await revealAllocation(allocation.id, ACTOR_ID);
  await confirmAllocation(allocation.id, ACTOR_ID);
  console.log("Confirmed allocation:", allocation.id);

  // Cleanup: correct it back and reset stage, leave 0 allocations.
  await correctAllocation(allocation.id, ACTOR_ID, "Display auto-refresh verification — not a real allocation.");
  await prisma.$transaction(async (tx) => {
    await tx.draftEvent.update({ where: { id: DRAFT_EVENT_ID }, data: { currentStage: DraftEventStage.INTRO, currentAllocationId: null, displaySequence: { increment: 1 } } });
    await writeAuditLog(tx, { action: "DRAFT_EVENT_STAGE_CHANGED", entityId: DRAFT_EVENT_ID, entityType: "DraftEvent", userId: ACTOR_ID, details: { stage: "INTRO", note: "reset after display-refresh verification" } });
  });
}

main().finally(() => prisma.$disconnect());
