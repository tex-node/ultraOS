import { writeAuditLog } from "../src/lib/audit";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const VENUE_ID = "cmqfqpnsb001ilgkkwq13sr5s";

async function main() {
  const before = await prisma.venue.findUniqueOrThrow({ where: { id: VENUE_ID } });
  await prisma.$transaction(async (tx) => {
    await tx.venue.update({
      where: { id: VENUE_ID },
      data: { address: "National Stadium, Surulere, Lagos", city: "Lagos", name: "NIS Outdoor Court, National Stadium Surulere" },
    });
    await writeAuditLog(tx, {
      action: "VENUE_CORRECTED",
      details: { fields: { address: { new: "National Stadium, Surulere, Lagos", old: before.address }, name: { new: "NIS Outdoor Court, National Stadium Surulere", old: before.name } }, reason: "Old venue was placeholder/demo data; administrator supplied the real Saturday venue. Capacity/contact info not changed - still unverified." },
      entityId: VENUE_ID,
      entityType: "Venue",
      userId: ACTOR_ID,
    });
  });
  console.log("Venue corrected:", before.name, "->", "NIS Outdoor Court, National Stadium Surulere");
  console.log("Capacity still on file (unverified for real venue):", before.capacity);
}

main().finally(() => prisma.$disconnect());
