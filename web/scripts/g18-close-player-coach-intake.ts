import { setApplicationTypeClosed } from "../src/lib/application-intake";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const REASON = "Closed ahead of the imminent tournament to prevent new names being added while the draft is finalized.";

async function main() {
  await setApplicationTypeClosed("PLAYER", true, ACTOR_ID, REASON);
  await setApplicationTypeClosed("COACH", true, ACTOR_ID, REASON);
  console.log("PLAYER and COACH application intake closed.");
}

main().finally(() => prisma.$disconnect());
