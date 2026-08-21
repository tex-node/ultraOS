import { writeAuditLog } from "../src/lib/audit";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const EVENT_ID = "seed-event-season-zero-launch";

async function main() {
  const zones = await prisma.seatZone.findMany({ where: { eventId: EVENT_ID } });
  await prisma.$transaction(async (tx) => {
    for (const zone of zones) {
      if (zone.priceKobo === 0) continue;
      await tx.seatZone.update({ where: { id: zone.id }, data: { priceKobo: 0 } });
      await writeAuditLog(tx, {
        action: "SEAT_ZONE_PRICE_CORRECTED",
        details: { newPriceKobo: 0, oldPriceKobo: zone.priceKobo, reason: "Confirmed the event is free - placeholder pricing removed." },
        entityId: zone.id,
        entityType: "SeatZone",
        userId: ACTOR_ID,
      });
      console.log(`${zone.name}: ${zone.priceKobo / 100} -> 0 (Free)`);
    }
  });
}

main().finally(() => prisma.$disconnect());
