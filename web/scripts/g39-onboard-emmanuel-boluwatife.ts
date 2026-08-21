import { createAdminOfflineIntake, provisionPlayerOfflineIntake } from "../src/lib/admin-offline-intake";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const SEASON_ID = "cmqfqpnkr0005lgkkihisj759";

async function main() {
  const result = await createAdminOfflineIntake({
    createdById: ACTOR_ID,
    email: "boluwatifeemmanuel964@gmail.com",
    fullName: "Emmanuel Boluwatife Peace",
    participantType: "PLAYER",
    phone: "08035150637",
    playerProfile: {
      dateOfBirth: "2010-03-29",
      dominantHand: "RIGHT",
      gender: "FEMALE",
      heightCm: 180,
      position: "Small forward",
      weightKg: 70,
    },
    reason: "Offline-recruited player to help complete an 8-man squad.",
  });

  if (!result.created) {
    console.log("NOT CREATED - matches existing identity:", JSON.stringify(result.matches, null, 2));
    return;
  }
  console.log("Created intake:", result.intake.id);

  const provisioned = await provisionPlayerOfflineIntake(result.intake.id, SEASON_ID, ACTOR_ID);
  console.log(provisioned.alreadyProvisioned ? "Already provisioned." : `Provisioned -> playerId=${provisioned.player.id}`);
}

main().finally(() => prisma.$disconnect());
