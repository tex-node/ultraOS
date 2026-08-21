import { updateAdminOfflineIntakeContact } from "../src/lib/admin-offline-intake";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const INTAKE_ID = "cmsorabep0000zlkkzl7li1m4"; // Okoro Nmesomachukwu Naomi

async function main() {
  const updated = await updateAdminOfflineIntakeContact(INTAKE_ID, { email: "continental2002us@yahoo.com" }, ACTOR_ID);
  console.log("Updated:", updated.fullName, updated.email, updated.phone, updated.status);
}

main().finally(() => prisma.$disconnect());
