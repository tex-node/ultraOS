import { writeAuditLog } from "../src/lib/audit";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const INTAKE_ID = "cmsorabep0000zlkkzl7li1m4"; // Okoro Nmesomachukwu Naomi

async function main() {
  const intake = await prisma.adminOfflineIntake.findUniqueOrThrow({ where: { id: INTAKE_ID } });
  if (intake.status !== "READY_FOR_PROVISIONING") {
    console.log("Already", intake.status, "- no correction needed.");
    return;
  }
  await prisma.$transaction(async (tx) => {
    await tx.adminOfflineIntake.update({ where: { id: INTAKE_ID }, data: { status: "DRAFT" } });
    await writeAuditLog(tx, {
      action: "ADMIN_OFFLINE_INTAKE_STATUS_CORRECTED",
      details: { newStatus: "DRAFT", oldStatus: "READY_FOR_PROVISIONING", reason: "Bug fix: updateAdminOfflineIntakeContact incorrectly flipped a PLAYER-type intake to READY_FOR_PROVISIONING based on email presence instead of playerProfile completeness. Profile is still missing dateOfBirth/dominantHand/position/heightCm/weightKg." },
      entityId: INTAKE_ID,
      entityType: "AdminOfflineIntake",
      userId: ACTOR_ID,
    });
  });
  console.log("Corrected status to DRAFT.");
}

main().finally(() => prisma.$disconnect());
