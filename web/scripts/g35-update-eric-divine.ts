import { missingPlayerProfileFields, updateAdminOfflineIntakePlayerProfile } from "../src/lib/admin-offline-intake";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const INTAKE_ID = "cmsoqoyoa000cgckk66l0v7va";

async function main() {
  const updated = await updateAdminOfflineIntakePlayerProfile(
    INTAKE_ID,
    { dateOfBirth: "2010-07-10", dominantHand: "RIGHT", heightCm: 178, weightKg: 80 },
    ACTOR_ID,
  );
  const missing = missingPlayerProfileFields(updated.playerProfile as never);
  console.log("Eric Divine: profile updated, status=" + updated.status);
  console.log("Still missing:", missing.length ? missing.join(", ") : "nothing - ready to provision");
}

main().finally(() => prisma.$disconnect());
