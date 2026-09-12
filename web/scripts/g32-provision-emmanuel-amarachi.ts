import { provisionPlayerOfflineIntake, updateAdminOfflineIntakePlayerProfile } from "../src/lib/admin-offline-intake";
import { prisma } from "../src/lib/prisma";

// Phase 1 Stage 5.5B: admin-offline-intake.ts functions now require an explicit
// organizationId - this historical one-off script always meant Neon Ultra.
const NEON_ULTRA_ORGANIZATION_ID = "cmt4odhgn0000wokk8fbwr6ro";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const SEASON_ID = "cmqfqpnkr0005lgkkihisj759";
const INTAKE_ID = "cmsoqoypc000ggckk3qk8xn1h";

function feetInchesToCm(feet: number, inches: number) {
  return Math.round((feet * 12 + inches) * 2.54);
}

async function main() {
  await updateAdminOfflineIntakePlayerProfile(NEON_ULTRA_ORGANIZATION_ID, 
    INTAKE_ID,
    { dateOfBirth: "2009-10-07", dominantHand: "RIGHT", heightCm: feetInchesToCm(6, 3), position: "Power forward", weightKg: 80 },
    ACTOR_ID,
  );
  const result = await provisionPlayerOfflineIntake(NEON_ULTRA_ORGANIZATION_ID, INTAKE_ID, SEASON_ID, ACTOR_ID);
  if (result.alreadyProvisioned) console.log("Already provisioned.");
  else console.log(`Emmanuel Amarachi: provisioned -> playerId=${result.player.id}`);
}

main().finally(() => prisma.$disconnect());
