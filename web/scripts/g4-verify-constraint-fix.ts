import { AllocationSubjectType } from "../src/generated/prisma/enums";
import { correctAllocation, reserveNextAllocation } from "../src/lib/draft-events";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const DRAFT_EVENT_ID = "cmsmoolbl0000rckk9wr5cezj";
const MEN_DIVISION_ID = "cmqfqpnke0003lgkkkgev3oyt";

async function main() {
  const before = await prisma.draftAllocation.count({ where: { draftEventId: DRAFT_EVENT_ID } });
  console.log("Allocations before:", before);

  const allocation = await reserveNextAllocation({ organizationId: "cmt4odhgn0000wokk8fbwr6ro",  draftEventId: DRAFT_EVENT_ID, divisionId: MEN_DIVISION_ID, subjectType: AllocationSubjectType.COACH, userId: ACTOR_ID });
  console.log("Reserve succeeded:", allocation.id, "staffId:", allocation.staffId, "status:", allocation.status);

  const staleCorrected = await prisma.draftAllocation.count({ where: { draftEventId: DRAFT_EVENT_ID, status: "CORRECTED" } });
  console.log("Stale CORRECTED rows remaining (should be 0, superseded and cleared):", staleCorrected);

  // Clean up: correct this verification allocation and reset stage for the operator.
  await correctAllocation("cmt4odhgn0000wokk8fbwr6ro", allocation.id, ACTOR_ID, "Verification test for DraftAllocation unique-constraint fix — not a real allocation.");

  const officialWrites = await prisma.seasonClub.count({ where: { headCoachId: { not: null } } });
  console.log("Official coach writes after correction (must be 0):", officialWrites);
}

main().finally(() => prisma.$disconnect());
