import { createAdminOfflineIntake, provisionPlayerOfflineIntake } from "../src/lib/admin-offline-intake";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const SEASON_ID = "cmqfqpnkr0005lgkkihisj759";

function feetInchesToCm(feet: number, inches: number) {
  return Math.round((feet * 12 + inches) * 2.54);
}

function lbsToKg(lbs: number) {
  return Math.round(lbs * 0.453592);
}

async function main() {
  const egbayelo = await createAdminOfflineIntake({
    createdById: ACTOR_ID,
    email: "egbayelopeter06@gmail.com",
    phone: "09071241163",
    fullName: "Egbayelo Peter",
    participantType: "PLAYER",
    playerProfile: {
      dateOfBirth: "2009-05-19",
      dominantHand: "RIGHT",
      gender: "MALE",
      heightCm: feetInchesToCm(6, 1),
      position: "Point guard / Small forward",
      weightKg: lbsToKg(154),
    },
    reason: "Offline-recruited player.",
  });

  if (!egbayelo.created) {
    console.log("Egbayelo Peter — NOT CREATED, matches existing identity:", JSON.stringify(egbayelo.matches, null, 2));
  } else {
    console.log("Egbayelo Peter — created intake:", egbayelo.intake.id);
    const provisioned = await provisionPlayerOfflineIntake(egbayelo.intake.id, SEASON_ID, ACTOR_ID);
    console.log(provisioned.alreadyProvisioned ? "Already provisioned." : `Provisioned -> playerId=${provisioned.player.id}`);
  }
}

main().finally(() => prisma.$disconnect());
