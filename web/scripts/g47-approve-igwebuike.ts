import { writeAuditLog } from "../src/lib/audit";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const APPLICATION_ID = "cmrqftl8u00bjfekkmhl91nh0";

async function main() {
  const application = await prisma.application.findUniqueOrThrow({ where: { id: APPLICATION_ID } });
  if (application.status === "APPROVED") {
    console.log("Already APPROVED.");
    return;
  }
  await prisma.$transaction(async (tx) => {
    await tx.application.update({ where: { id: APPLICATION_ID }, data: { status: "APPROVED", reviewedAt: new Date(), reviewedById: ACTOR_ID } });
    await writeAuditLog(tx, {
      action: "SEASON_ZERO_PLAYER_APPLICATION_APPROVED",
      details: { name: "Igwebuike Oluchukwu Sylvia (submitted as Oluchukwu Igwebuike)", newStatus: "APPROVED", oldStatus: application.status, reason: "Approved as an offline-style recruit to help complete an 8-man squad. Athlete/Player creation deferred until weight and dominant hand are supplied." },
      entityId: APPLICATION_ID,
      entityType: "Application",
      userId: ACTOR_ID,
    });
  });
  console.log("Approved:", APPLICATION_ID);
}

main().finally(() => prisma.$disconnect());
