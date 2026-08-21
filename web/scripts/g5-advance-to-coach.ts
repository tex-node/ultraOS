import { DraftEventStage } from "../src/generated/prisma/enums";
import { writeAuditLog } from "../src/lib/audit";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const DRAFT_EVENT_ID = "cmsmoolbl0000rckk9wr5cezj";

async function main() {
  await prisma.$transaction(async (tx) => {
    await tx.draftEvent.update({ where: { id: DRAFT_EVENT_ID }, data: { currentStage: DraftEventStage.MEN_COACH_ALLOCATION, displaySequence: { increment: 1 } } });
    await writeAuditLog(tx, { action: "DRAFT_EVENT_STAGE_CHANGED", entityId: DRAFT_EVENT_ID, entityType: "DraftEvent", userId: ACTOR_ID, details: { stage: "MEN_COACH_ALLOCATION", note: "Advanced by admin: all 8 squads confirmed, 0 coaches allocated yet since the operator's earlier reset." } });
  });
  const event = await prisma.draftEvent.findUniqueOrThrow({ where: { id: DRAFT_EVENT_ID } });
  console.log("currentStage now:", event.currentStage);
}

main().finally(() => prisma.$disconnect());
