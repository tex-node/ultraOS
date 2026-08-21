import { AllocationSubjectType, DraftEventStage } from "../src/generated/prisma/enums";
import { correctAllocation, reserveNextAllocation } from "../src/lib/draft-events";
import { writeAuditLog } from "../src/lib/audit";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const DRAFT_EVENT_ID = "cmsmoolbl0000rckk9wr5cezj";
const MEN_DIVISION_ID = "cmqfqpnke0003lgkkkgev3oyt";

async function main() {
  await prisma.$transaction(async (tx) => {
    await tx.draftEvent.update({ where: { id: DRAFT_EVENT_ID }, data: { currentStage: DraftEventStage.MEN_COACH_ALLOCATION, displaySequence: { increment: 1 } } });
    await writeAuditLog(tx, { action: "DRAFT_EVENT_STAGE_CHANGED", entityId: DRAFT_EVENT_ID, entityType: "DraftEvent", userId: ACTOR_ID, details: { stage: "MEN_COACH_ALLOCATION" } });
  });

  const allocation = await reserveNextAllocation({ draftEventId: DRAFT_EVENT_ID, divisionId: MEN_DIVISION_ID, subjectType: AllocationSubjectType.COACH, userId: ACTOR_ID });
  console.log("Reserved:", allocation.id, "status:", allocation.status);

  const eventDuring = await prisma.draftEvent.findUniqueOrThrow({ where: { id: DRAFT_EVENT_ID } });
  console.log("currentAllocationId while reserved:", eventDuring.currentAllocationId);

  // This mirrors exactly what the new "Cancel this reservation" button calls.
  await correctAllocation(allocation.id, ACTOR_ID, "Operator cancelled before reveal — testing new cancel button.");

  const eventAfter = await prisma.draftEvent.findUniqueOrThrow({ where: { id: DRAFT_EVENT_ID } });
  const allocationAfter = await prisma.draftAllocation.findUniqueOrThrow({ where: { id: allocation.id } });
  console.log("currentAllocationId after cancel (must be null):", eventAfter.currentAllocationId);
  console.log("allocation status after cancel:", allocationAfter.status);

  const officialWrites = await prisma.seasonClub.count({ where: { headCoachId: { not: null } } });
  console.log("Official coach writes (must be 0):", officialWrites);

  // Prove the subject/club is immediately available again — the exact scenario the earlier fix addressed.
  const reReserved = await reserveNextAllocation({ draftEventId: DRAFT_EVENT_ID, divisionId: MEN_DIVISION_ID, subjectType: AllocationSubjectType.COACH, userId: ACTOR_ID });
  console.log("Re-reserve after cancel succeeded:", reReserved.id, "staffId:", reReserved.staffId);
  await correctAllocation(reReserved.id, ACTOR_ID, "Cleanup after cancel-button verification.");

  await prisma.$transaction(async (tx) => {
    await tx.draftEvent.update({ where: { id: DRAFT_EVENT_ID }, data: { currentStage: DraftEventStage.INTRO, currentAllocationId: null, displaySequence: { increment: 1 } } });
    await writeAuditLog(tx, { action: "DRAFT_EVENT_STAGE_CHANGED", entityId: DRAFT_EVENT_ID, entityType: "DraftEvent", userId: ACTOR_ID, details: { stage: "INTRO", note: "reset after cancel-button verification" } });
  });
  const finalAllocCount = await prisma.draftAllocation.count({ where: { draftEventId: DRAFT_EVENT_ID } });
  console.log("Final DraftAllocation rows for this event (all CORRECTED, harmless):", finalAllocCount);
}

main().finally(() => prisma.$disconnect());
