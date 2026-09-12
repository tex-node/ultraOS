import { provisionPlayerOfflineIntake, updateAdminOfflineIntakePlayerProfile } from "../src/lib/admin-offline-intake";
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
  const ginikaResult = await provisionPlayerOfflineIntake(NEON_ULTRA_ORGANIZATION_ID, "cmsp09w0y0000n1kkxav3yfdd", SEASON_ID, ACTOR_ID);
  if (ginikaResult.alreadyProvisioned) console.log("Ginika: already provisioned");
  else console.log(`Ginika Ezeogu: provisioned -> playerId=${ginikaResult.player.id}`);

  const roliIntakeId = "cmsoqoymy0008gckk8w3ine3c";
  await updateAdminOfflineIntakePlayerProfile(NEON_ULTRA_ORGANIZATION_ID, 
    roliIntakeId,
    { dateOfBirth: "2012-06-14", dominantHand: "RIGHT", heightCm: feetInchesToCm(5, 10), position: "Guard", weightKg: 79 },
    ACTOR_ID,
  );
  const roliResult = await provisionPlayerOfflineIntake(NEON_ULTRA_ORGANIZATION_ID, roliIntakeId, SEASON_ID, ACTOR_ID);
  if (roliResult.alreadyProvisioned) console.log("Roli: already provisioned");
  else console.log(`Roli Omatseye: provisioned -> playerId=${roliResult.player.id}`);
}

main().finally(() => prisma.$disconnect());
