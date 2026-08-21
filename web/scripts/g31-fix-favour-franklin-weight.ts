import { writeAuditLog } from "../src/lib/audit";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const PLAYER_ID = "cmrb30eqc00wputkk86emwtfu";

async function main() {
  const before = await prisma.player.findUniqueOrThrow({ where: { id: PLAYER_ID } });
  await prisma.$transaction(async (tx) => {
    await tx.player.update({ where: { id: PLAYER_ID }, data: { weightKg: 90 } });
    await writeAuditLog(tx, {
      action: "PLAYER_PROFILE_CORRECTED",
      details: { fields: { weightKg: { new: 90, old: before.weightKg } }, playerName: "Favour Frankly (Favour Franklin)", reason: "Weight was recorded as 0kg (data gap from original application); administrator supplied the real value." },
      entityId: PLAYER_ID,
      entityType: "Player",
      userId: ACTOR_ID,
    });
  });
  console.log("Favour Franklin: weightKg 0 -> 90");
}

main().finally(() => prisma.$disconnect());
