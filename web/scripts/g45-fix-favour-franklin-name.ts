import { writeAuditLog } from "../src/lib/audit";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const PLAYER_ID = "cmrb30eqc00wputkk86emwtfu";

async function main() {
  const player = await prisma.player.findUniqueOrThrow({ where: { id: PLAYER_ID }, include: { athlete: true } });
  const before = player.athlete;
  await prisma.$transaction(async (tx) => {
    await tx.athlete.update({ where: { id: before.id }, data: { lastName: "Franklin" } });
    await writeAuditLog(tx, {
      action: "ATHLETE_NAME_CORRECTED",
      details: { newLastName: "Franklin", oldLastName: before.lastName, reason: "Administrator confirmed correct spelling is Franklin, not Frankly (typo from original application)." },
      entityId: before.id,
      entityType: "Athlete",
      userId: ACTOR_ID,
    });
  });
  console.log(`Corrected: ${before.firstName} Frankly -> ${before.firstName} Franklin`);
}

main().finally(() => prisma.$disconnect());
