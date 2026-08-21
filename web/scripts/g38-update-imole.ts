import { missingPlayerProfileFields, updateAdminOfflineIntakePlayerProfile } from "../src/lib/admin-offline-intake";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const INTAKE_ID = "cmsoqoyl80004gckkmzpwjcll";

function feetInchesToCm(feet: number, inches: number) {
  return Math.round((feet * 12 + inches) * 2.54);
}

async function main() {
  const updated = await updateAdminOfflineIntakePlayerProfile(
    INTAKE_ID,
    { dateOfBirth: "2010-08-12", heightCm: feetInchesToCm(5, 8), position: "Guard", weightKg: 45 },
    ACTOR_ID,
  );
  const missing = missingPlayerProfileFields(updated.playerProfile as never);
  console.log("Imole Olorunfemi: profile updated, status=" + updated.status);
  console.log("Still missing:", missing.length ? missing.join(", ") : "nothing - ready to provision");
}

main().finally(() => prisma.$disconnect());
