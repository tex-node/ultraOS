import { createAdminOfflineIntake, provisionPlayerOfflineIntake } from "../src/lib/admin-offline-intake";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const SEASON_ID = "cmqfqpnkr0005lgkkihisj759";

function feetInchesToCm(feet: number, inches: number) {
  return Math.round((feet * 12 + inches) * 2.54);
}

async function main() {
  const result = await createAdminOfflineIntake({
    createdById: ACTOR_ID,
    email: "adeshinaadunni2@gmail.com",
    fullName: "Adeshina Funmilayo",
    participantType: "PLAYER",
    playerProfile: {
      dateOfBirth: "2009-02-02",
      dominantHand: "RIGHT",
      gender: "FEMALE",
      heightCm: feetInchesToCm(5, 10),
      position: "Shooting guard",
      weightKg: 70,
    },
    reason: "Offline-recruited player to help complete an 8-man squad. No phone on file yet.",
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
