import { writeAuditLog } from "../src/lib/audit";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const PLAYER_ID = "cmr4s1rqy00f7utkkun41rkbc";

async function main() {
  const before = await prisma.player.findUniqueOrThrow({ where: { id: PLAYER_ID } });

  await prisma.$transaction(async (tx) => {
    const updated = await tx.player.update({
      where: { id: PLAYER_ID },
      data: { weightKg: 60 },
    });
    await writeAuditLog(tx, {
      action: "PLAYER_WEIGHT_UPDATED",
      details: {
        previousWeightKg: before.weightKg,
        newWeightKg: updated.weightKg,
        reason: "Weight was a placeholder (0) on file; admin confirmed real weight as 60kg.",
      },
      entityId: PLAYER_ID,
      entityType: "Player",
      userId: ACTOR_ID,
    });
    console.log("Updated:", { previousWeightKg: before.weightKg, newWeightKg: updated.weightKg });
  });
}

main().finally(() => prisma.$disconnect());
