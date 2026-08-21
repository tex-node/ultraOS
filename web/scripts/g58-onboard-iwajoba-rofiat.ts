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
    email: "Iwajobarofiat2@gmail.com",
    phone: "07015111885",
    fullName: "Iwajoba Rofiat",
    participantType: "PLAYER",
    playerProfile: {
      dateOfBirth: "2010-04-23",
      dominantHand: "RIGHT",
      gender: "FEMALE",
      heightCm: feetInchesToCm(5, 7),
      position: "Guard",
      weightKg: 80,
    },
    reason: "Offline-recruited reserve player, to be drafted live on game day (Secondary Draft pool).",
  });

  if (!result.created) {
    console.log("NOT CREATED - matches existing identity:", JSON.stringify(result.matches, null, 2));
    return;
  }
  console.log("Created intake:", result.intake.id);

  const provisioned = await provisionPlayerOfflineIntake(result.intake.id, SEASON_ID, ACTOR_ID);
  console.log(provisioned.alreadyProvisioned ? "Already provisioned." : `Provisioned -> playerId=${provisioned.player.id}, draftSelectionGroup set for game-day draft`);
}

main().finally(() => prisma.$disconnect());
