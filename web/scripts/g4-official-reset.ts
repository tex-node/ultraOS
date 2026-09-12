import { resetRehearsalAllocations } from "../src/lib/draft-events";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const DRAFT_EVENT_ID = "cmsmoolbl0000rckk9wr5cezj";

async function main() {
  await resetRehearsalAllocations("cmt4odhgn0000wokk8fbwr6ro", DRAFT_EVENT_ID, ACTOR_ID, "Clearing leftover test/rehearsal allocations before operator resumes — official audited reset.");
  const remaining = await prisma.draftAllocation.count({ where: { draftEventId: DRAFT_EVENT_ID } });
  const event = await prisma.draftEvent.findUniqueOrThrow({ where: { id: DRAFT_EVENT_ID } });
  const officialWrites = await prisma.seasonClub.count({ where: { OR: [{ headCoachId: { not: null } }, { assistantCoachId: { not: null } }] } });
  console.log(JSON.stringify({ remaining, status: event.status, operatingMode: event.operatingMode, currentStage: event.currentStage, officialWrites }, null, 2));
}

main().finally(() => prisma.$disconnect());
