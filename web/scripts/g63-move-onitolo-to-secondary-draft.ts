import { writeAuditLog } from "../src/lib/audit";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const PLAYER_ID = "cmr4s1rqy00f7utkkun41rkbc";

async function main() {
  const before = await prisma.player.findUniqueOrThrow({ where: { id: PLAYER_ID } });
  if (before.draftSelectionGroup === "SECONDARY_DRAFT") {
    console.log("Already SECONDARY_DRAFT. No action taken.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    const updated = await tx.player.update({
      where: { id: PLAYER_ID },
      data: { draftSelectionGroup: "SECONDARY_DRAFT" },
    });
    await writeAuditLog(tx, {
      action: "PLAYER_DRAFT_GROUP_UPDATED",
      details: {
        previousGroup: before.draftSelectionGroup,
        newGroup: updated.draftSelectionGroup,
        reason: "Onitolo Koyinsola Deborah re-confirmed by admin as active recruit; moved from pending selection into the Secondary Draft pool. Weight remains a placeholder (0) - user-supplied value (8kg) is implausible and was not applied, held out pending confirmation of the real figure.",
      },
      entityId: PLAYER_ID,
      entityType: "Player",
      userId: ACTOR_ID,
    });
    console.log("Updated:", { previousGroup: before.draftSelectionGroup, newGroup: updated.draftSelectionGroup });
  });
}

main().finally(() => prisma.$disconnect());
