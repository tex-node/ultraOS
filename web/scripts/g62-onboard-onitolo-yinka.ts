import { createAdminOfflineIntake, provisionPlayerOfflineIntake } from "../src/lib/admin-offline-intake";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const SEASON_ID = "cmqfqpnkr0005lgkkihisj759";

function feetInchesToCm(feet: number, inches: number) {
  return Math.round((feet * 12 + inches) * 2.54);
}

async function main() {
  // Yinka Daudu — complete profile, provision straight through.
  const yinka = await createAdminOfflineIntake({
    createdById: ACTOR_ID,
    email: "Itsyinkadaudu@gmail.com",
    phone: "08123598542",
    fullName: "Yinka Daudu",
    participantType: "PLAYER",
    playerProfile: {
      dateOfBirth: "2009-04-02",
      dominantHand: "RIGHT",
      gender: "FEMALE",
      heightCm: feetInchesToCm(6, 2),
      position: "Small forward",
      weightKg: 70,
    },
    reason: "Offline-recruited player.",
  });
  if (!yinka.created) {
    console.log("Yinka Daudu — NOT CREATED, matches existing identity:", JSON.stringify(yinka.matches, null, 2));
  } else {
    console.log("Yinka Daudu — created intake:", yinka.intake.id);
    const provisioned = await provisionPlayerOfflineIntake(yinka.intake.id, SEASON_ID, ACTOR_ID);
    console.log(provisioned.alreadyProvisioned ? "Already provisioned." : `Provisioned -> playerId=${provisioned.player.id}`);
  }

  // Onitolo Koyinsola Deborah — weight given as "8kg" (implausible) and no DOB supplied.
  // Save the confident fields only; hold weight/DOB out rather than guess. Status will be
  // DRAFT (not yet draft-eligible) until those two are confirmed and added.
  const onitolo = await createAdminOfflineIntake({
    createdById: ACTOR_ID,
    email: "Onitolokoyinsoladeborah@gmail.com",
    phone: "07051650706",
    fullName: "Onitolo Koyinsola Deborah",
    participantType: "PLAYER",
    playerProfile: {
      dominantHand: "RIGHT",
      gender: "FEMALE",
      heightCm: feetInchesToCm(5, 5),
      position: "Point guard",
    },
    reason: "Offline-recruited player. Weight as supplied (8kg) is implausible and DOB was not supplied - both held out pending confirmation.",
  });
  if (!onitolo.created) {
    console.log("Onitolo Koyinsola Deborah — NOT CREATED, matches existing identity:", JSON.stringify(onitolo.matches, null, 2));
  } else {
    console.log("Onitolo Koyinsola Deborah — created intake (DRAFT, incomplete):", onitolo.intake.id);
  }
}

main().finally(() => prisma.$disconnect());
