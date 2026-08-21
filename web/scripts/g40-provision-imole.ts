import { provisionPlayerOfflineIntake, updateAdminOfflineIntakePlayerProfile } from "../src/lib/admin-offline-intake";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const SEASON_ID = "cmqfqpnkr0005lgkkihisj759";
const INTAKE_ID = "cmsoqoyl80004gckkmzpwjcll";

async function main() {
  await updateAdminOfflineIntakePlayerProfile(INTAKE_ID, { dominantHand: "RIGHT" }, ACTOR_ID);
  const result = await provisionPlayerOfflineIntake(INTAKE_ID, SEASON_ID, ACTOR_ID);
  console.log(result.alreadyProvisioned ? "Already provisioned." : `Imole Olorunfemi: provisioned -> playerId=${result.player.id}`);
}

main().finally(() => prisma.$disconnect());
