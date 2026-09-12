import { AllocationSubjectType, DraftEventOperatingMode } from "../src/generated/prisma/enums";
import { nextAllocationReadiness } from "../src/lib/draft-events";
import { prisma } from "../src/lib/prisma";

const DRAFT_EVENT_ID = "cmsmoolbl0000rckk9wr5cezj";
const MEN_DIVISION_ID = "cmqfqpnke0003lgkkkgev3oyt";

async function main() {
  const coachReadiness = await nextAllocationReadiness("cmt4odhgn0000wokk8fbwr6ro", DRAFT_EVENT_ID, MEN_DIVISION_ID, AllocationSubjectType.COACH, DraftEventOperatingMode.REHEARSAL);
  console.log("MEN COACH readiness (should be canReserve:false, all 4 clubs taken):", JSON.stringify(coachReadiness));

  const squadReadiness = await nextAllocationReadiness("cmt4odhgn0000wokk8fbwr6ro", DRAFT_EVENT_ID, MEN_DIVISION_ID, AllocationSubjectType.SQUAD, DraftEventOperatingMode.REHEARSAL);
  console.log("MEN SQUAD readiness (should be canReserve:true, nothing allocated yet):", JSON.stringify(squadReadiness));
}

main().finally(() => prisma.$disconnect());
