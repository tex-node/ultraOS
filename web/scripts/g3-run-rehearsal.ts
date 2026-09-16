import { AllocationStatus, AllocationSubjectType, DraftEventOperatingMode, DraftEventStage, DraftEventStatus } from "../src/generated/prisma/enums";
import {
  confirmAllocation,
  markAllocationRevealing,
  publicDraftEventState,
  revealAllocation,
  reserveNextAllocation,
} from "../src/lib/draft-events";
import { writeAuditLog } from "../src/lib/audit";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const DRAFT_EVENT_ID = "cmsmoolbl0000rckk9wr5cezj";
const MEN_DIVISION_ID = "cmqfqpnke0003lgkkkgev3oyt";
const WOMEN_DIVISION_ID = "cmqfqpnkl0004lgkkk2bjeqfm";

function assertNoLeak(publicState: Awaited<ReturnType<typeof publicDraftEventState>>, allocationId: string) {
  const alloc = publicState!.allocations.find((a) => a.id === allocationId);
  if (!alloc) throw new Error("Allocation not found in public state");
  if (alloc.status !== "RESERVED" && alloc.status !== "REVEALING") return;
  const json = JSON.stringify(alloc);
  if (json.includes('"name"') || (alloc as { squad?: unknown }).squad || (alloc as { staff?: unknown }).staff || (alloc as { seasonClub?: unknown }).seasonClub!) {
    throw new Error(`LEAK DETECTED: RESERVED/REVEALING allocation exposes identity: ${json}`);
  }
  console.log(`  [redaction OK] RESERVED payload: ${json}`);
}

async function runOne(divisionId: string, subjectType: AllocationSubjectType, label: string) {
  const allocation = await reserveNextAllocation({ organizationId: "cmt4odhgn0000wokk8fbwr6ro",  draftEventId: DRAFT_EVENT_ID, divisionId, subjectType, userId: ACTOR_ID });
  console.log(`RESERVE ${label}: allocation=${allocation.id}`);
  const stateAfterReserve = await publicDraftEventState(DRAFT_EVENT_ID);
  assertNoLeak(stateAfterReserve, allocation.id);

  await markAllocationRevealing("cmt4odhgn0000wokk8fbwr6ro", allocation.id, ACTOR_ID);
  await revealAllocation("cmt4odhgn0000wokk8fbwr6ro", allocation.id, ACTOR_ID);
  const stateAfterReveal = await publicDraftEventState(DRAFT_EVENT_ID);
  const revealedAlloc = stateAfterReveal!.allocations.find((a) => a.id === allocation.id);
  console.log(`  REVEAL ${label}: ${JSON.stringify(revealedAlloc)}`);

  await confirmAllocation("cmt4odhgn0000wokk8fbwr6ro", allocation.id, ACTOR_ID);
  console.log(`  CONFIRM ${label}: done`);
  return allocation.id;
}

async function main() {
  const confirmedLive = await prisma.draftAllocation.count({ where: { draftEventId: DRAFT_EVENT_ID, operatingMode: DraftEventOperatingMode.LIVE, status: AllocationStatus.CONFIRMED } });
  if (confirmedLive > 0) throw new Error("Refusing: LIVE allocations already exist for this event.");
  await prisma.$transaction(async (tx) => {
    await tx.draftEvent.update({
      where: { id: DRAFT_EVENT_ID },
      data: { operatingMode: DraftEventOperatingMode.REHEARSAL, startedAt: new Date(), status: DraftEventStatus.LIVE, displaySequence: { increment: 1 }, publicMessage: "Rehearsal mode started" },
    });
    await writeAuditLog(tx, { action: "DRAFT_EVENT_STARTED_REHEARSAL", entityId: DRAFT_EVENT_ID, entityType: "DraftEvent", userId: ACTOR_ID });
  });
  console.log("Rehearsal started (operatingMode=REHEARSAL, status=LIVE)\n");

  // MEN coach allocation — 4 of 5 (one reserve)
  await prisma.draftEvent.update({ where: { id: DRAFT_EVENT_ID }, data: { currentStage: DraftEventStage.MEN_COACH_ALLOCATION } });
  console.log("=== MEN COACH ALLOCATION (4 of 5, 1 reserve) ===");
  for (let i = 0; i < 4; i++) await runOne(MEN_DIVISION_ID, AllocationSubjectType.COACH, `MEN coach #${i + 1}`);

  // WOMEN coach allocation — all 4
  await prisma.draftEvent.update({ where: { id: DRAFT_EVENT_ID }, data: { currentStage: DraftEventStage.WOMEN_COACH_ALLOCATION } });
  console.log("\n=== WOMEN COACH ALLOCATION (4 of 4) ===");
  for (let i = 0; i < 4; i++) await runOne(WOMEN_DIVISION_ID, AllocationSubjectType.COACH, `WOMEN coach #${i + 1}`);

  // MEN squad allocation — all 4 groups
  await prisma.draftEvent.update({ where: { id: DRAFT_EVENT_ID }, data: { currentStage: DraftEventStage.MEN_SQUAD_ALLOCATION } });
  console.log("\n=== MEN SQUAD ALLOCATION (Groups 1-4) ===");
  for (let i = 0; i < 4; i++) await runOne(MEN_DIVISION_ID, AllocationSubjectType.SQUAD, `MEN group #${i + 1}`);

  // WOMEN squad allocation — all 4 groups (Group 4 has only 2 players)
  await prisma.draftEvent.update({ where: { id: DRAFT_EVENT_ID }, data: { currentStage: DraftEventStage.WOMEN_SQUAD_ALLOCATION } });
  console.log("\n=== WOMEN SQUAD ALLOCATION (Groups 1-4, Group 4 incomplete 2/5) ===");
  for (let i = 0; i < 4; i++) await runOne(WOMEN_DIVISION_ID, AllocationSubjectType.SQUAD, `WOMEN group #${i + 1}`);

  console.log("\nRehearsal main sequence complete.");
}

main().finally(() => prisma.$disconnect());
