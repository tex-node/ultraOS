import { correctAllocation } from "../src/lib/draft-events";
import { writeAuditLog } from "../src/lib/audit";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const DRAFT_EVENT_ID = "cmsmoolbl0000rckk9wr5cezj";
const REASON = "Administrator confirmed this was still testing, not the real event. Reversing the 2 LIVE coach confirmations and switching back to REHEARSAL.";

const liveAllocationIds = ["cmsmxrc370009eskk29qnzlmt", "cmsmxu3l7000deskkhu5z61d9"];

async function main() {
  for (const id of liveAllocationIds) {
    await correctAllocation(id, ACTOR_ID, REASON);
    console.log("Corrected:", id);
  }

  const officialCoach = await prisma.seasonClub.count({ where: { OR: [{ headCoachId: { not: null } }, { assistantCoachId: { not: null } }] } });
  const officialPlayers = await prisma.player.count({ where: { seasonClubId: { not: null } } });
  console.log("Official coach assignments after correction (must be 0):", officialCoach);
  console.log("Official player assignments after correction (must be 0):", officialPlayers);

  const liveConfirmed = await prisma.draftAllocation.count({ where: { draftEventId: DRAFT_EVENT_ID, operatingMode: "LIVE", status: "CONFIRMED" } });
  console.log("Remaining CONFIRMED LIVE allocations (must be 0 before mode switch):", liveConfirmed);
  if (liveConfirmed > 0) throw new Error("Refusing to switch mode: LIVE confirmed allocations still exist.");

  await prisma.$transaction(async (tx) => {
    await tx.draftEvent.update({ where: { id: DRAFT_EVENT_ID }, data: { operatingMode: "REHEARSAL" } });
    await writeAuditLog(tx, {
      action: "DRAFT_EVENT_OPERATING_MODE_SWITCHED_TO_REHEARSAL",
      details: { draftEventId: DRAFT_EVENT_ID, previousMode: "LIVE", newMode: "REHEARSAL", reason: "Administrator confirmed still testing; reverted after 2 live coach confirmations were corrected." },
      entityId: DRAFT_EVENT_ID,
      entityType: "DraftEvent",
      userId: ACTOR_ID,
    });
  });

  const event = await prisma.draftEvent.findUniqueOrThrow({ where: { id: DRAFT_EVENT_ID } });
  console.log("Final DraftEvent:", JSON.stringify({ status: event.status, operatingMode: event.operatingMode, currentStage: event.currentStage }));
}

main().finally(() => prisma.$disconnect());
