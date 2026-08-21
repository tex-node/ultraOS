import { writeAuditLog } from "../src/lib/audit";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const PLAYER_ID = "cmr4r6x7x00csutkkxxneqqpn";

async function main() {
  const before = await prisma.player.findUniqueOrThrow({ where: { id: PLAYER_ID } });
  await prisma.$transaction(async (tx) => {
    await tx.player.update({
      where: { id: PLAYER_ID },
      data: { draftSelectionGroup: "SECONDARY_DRAFT", weightKg: 93 },
    });
    await writeAuditLog(tx, {
      action: "PLAYER_PROFILE_CORRECTED",
      details: { fields: { draftSelectionGroup: { new: "SECONDARY_DRAFT", old: before.draftSelectionGroup }, weightKg: { new: 93, old: before.weightKg } }, playerName: "Munachi Okafor", reason: "Weight was recorded as 0kg (data gap from original application); administrator supplied the real value. Also confirmed eligible for Secondary Draft." },
      entityId: PLAYER_ID,
      entityType: "Player",
      userId: ACTOR_ID,
    });
  });
  console.log("Munachi Okafor: weightKg 0 -> 93, draftSelectionGroup -> SECONDARY_DRAFT");
}

main().finally(() => prisma.$disconnect());
