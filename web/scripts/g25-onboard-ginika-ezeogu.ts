import { writeAuditLog } from "../src/lib/audit";
import { provisionPlayerOfflineIntake } from "../src/lib/admin-offline-intake";
import { prisma } from "../src/lib/prisma";

// Phase 1 Stage 5.5B: admin-offline-intake.ts functions now require an explicit
// organizationId - this historical one-off script always meant Neon Ultra.
const NEON_ULTRA_ORGANIZATION_ID = "cmt4odhgn0000wokk8fbwr6ro";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const SEASON_ID = "cmqfqpnkr0005lgkkihisj759";

function feetInchesToCm(feet: number, inches: number) {
  return Math.round((feet * 12 + inches) * 2.54);
}

async function main() {
  const intake = await prisma.$transaction(async (tx) => {
    const created = await tx.adminOfflineIntake.create({
      data: {
        createdById: ACTOR_ID,
        email: "ginikaezeogu@gmail.com",
        fullName: "Ginika Ezeogu",
        participantType: "PLAYER",
        phone: "08053066406",
        playerProfile: {
          dateOfBirth: "2012-06-04",
          dominantHand: "RIGHT",
          gender: "FEMALE",
          heightCm: feetInchesToCm(5, 10),
          position: "Guard",
          weightKg: 79,
        },
        reason:
          "Offline-recruited player to help complete an 8-man squad. A bare FAN-role User account " +
          "(ginikaezeogu1@gmail.com, no Athlete/Application ever attached) already existed under a near-identical " +
          "email/name; manually reviewed and confirmed not a real conflict before creating this record.",
        status: "READY_FOR_PROVISIONING",
      },
    });
    await writeAuditLog(tx, {
      action: "ADMIN_OFFLINE_INTAKE_CREATED",
      details: { fullName: created.fullName, note: "Manually created bypassing the name-collision guard after confirming the matched User has no Athlete/Application.", participantType: "PLAYER" },
      entityId: created.id,
      entityType: "AdminOfflineIntake",
      userId: ACTOR_ID,
    });
    return created;
  });
  console.log("Created intake:", intake.id);

  const result = await provisionPlayerOfflineIntake(NEON_ULTRA_ORGANIZATION_ID, intake.id, SEASON_ID, ACTOR_ID);
  if (result.alreadyProvisioned) {
    console.log("Already provisioned.");
  } else {
    console.log(`Provisioned -> playerId=${result.player.id}, athleteId=${result.athlete.id}`);
  }
}

main().finally(() => prisma.$disconnect());
