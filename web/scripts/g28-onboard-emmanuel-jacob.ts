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
    email: "emmanueltomiwa131@gmail.com",
    fullName: "Emmanuel Jacob",
    participantType: "PLAYER",
    phone: "08144315095",
    playerProfile: {
      dateOfBirth: "2007-11-24",
      dominantHand: "RIGHT",
      gender: "MALE",
      heightCm: feetInchesToCm(6, 0),
      position: "Point guard",
      weightKg: 65,
    },
    reason: "Offline-recruited player to help complete an 8-man squad.",
  });

  if (!result.created) {
    console.log("NOT CREATED - matches existing identity:", JSON.stringify(result.matches, null, 2));
    return;
  }
  console.log("Created intake:", result.intake.id);

  const provisioned = await provisionPlayerOfflineIntake(result.intake.id, SEASON_ID, ACTOR_ID);
  if (provisioned.alreadyProvisioned) console.log("Already provisioned.");
  else console.log(`Provisioned -> playerId=${provisioned.player.id}`);
}

main().finally(() => prisma.$disconnect());
