import { writeAuditLog } from "../src/lib/audit";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const ATHLETE_ID = "cmsmm7vxz001r2okkdgs1k6d4";

async function main() {
  const before = await prisma.athlete.findUniqueOrThrow({ where: { id: ATHLETE_ID } });
  await prisma.$transaction(async (tx) => {
    await tx.athlete.update({ where: { id: ATHLETE_ID }, data: { lastName: "Adebayo" } });
    await writeAuditLog(tx, {
      action: "ATHLETE_NAME_CORRECTED",
      details: { newLastName: "Adebayo", oldLastName: before.lastName, reason: "Administrator confirmed correct surname is Adebayo, not Aden." },
      entityId: ATHLETE_ID,
      entityType: "Athlete",
      userId: ACTOR_ID,
    });
  });
  console.log(`Corrected: ${before.firstName} Aden -> ${before.firstName} Adebayo`);
}

main().finally(() => prisma.$disconnect());
