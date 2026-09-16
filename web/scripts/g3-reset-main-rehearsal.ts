import { resetRehearsalAllocations } from "../src/lib/draft-events";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const DRAFT_EVENT_ID = "cmsmoolbl0000rckk9wr5cezj";

async function main() {
  await resetRehearsalAllocations("cmt4odhgn0000wokk8fbwr6ro", DRAFT_EVENT_ID, ACTOR_ID, "Final pre-Draft production rehearsal reset.");

  const remainingAllocations = await prisma.draftAllocation.count({ where: { draftEventId: DRAFT_EVENT_ID } });
  const liveAllocations = await prisma.draftAllocation.count({ where: { operatingMode: "LIVE" } });
  const playerAssignments = await prisma.player.count({ where: { seasonClubId: { not: null } } });
  const coachAssignments = await prisma.seasonClub!.count({ where: { OR: [{ headCoachId: { not: null } }, { assistantCoachId: { not: null } }] } });
  const event = await prisma.draftEvent.findUniqueOrThrow({ where: { id: DRAFT_EVENT_ID } });

  console.log(JSON.stringify({
    remainingAllocations,
    liveAllocations,
    playerAssignments,
    coachAssignments,
    eventStatus: event.status,
    eventOperatingMode: event.operatingMode,
    eventCurrentStage: event.currentStage,
  }, null, 2));
}

main().finally(() => prisma.$disconnect());
