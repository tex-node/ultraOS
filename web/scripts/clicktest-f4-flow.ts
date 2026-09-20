import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { promoDiscountKobo } from "../src/lib/ticketing";
import { upsertPublicTokenLocator } from "../src/lib/public-locators";
import { PublicTokenLocatorType } from "../src/generated/prisma/enums";
import { emailTicketQr } from "../src/app/public/tickets/actions";

const EVENT_ID = "seed-event-season-zero-launch";

async function main() {
  const c = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    const org = await c.organization.findUniqueOrThrow({ where: { slug: "neon-ultra" }, select: { id: true } });
    const paid = await c.seatZone.findFirstOrThrow({ where: { eventId: EVENT_ID, name: "Click-Test Paid" }, select: { id: true, priceKobo: true } });
    const pass = await c.seatZone.findFirstOrThrow({ where: { eventId: EVENT_ID, name: "Click-Test Day Pass" }, select: { id: true, priceKobo: true } });
    const promo = await c.promoCode.findFirstOrThrow({ where: { code: "CLICKTEST20" }, select: { id: true, discountBps: true } });

    // Mirror reserveZone's writes exactly: 2 x NGN1000 - 20% promo = NGN1600.
    const gross = paid.priceKobo * 2;
    const total = gross - promoDiscountKobo(gross, promo.discountBps);
    const reservation = await c.seatReservation.create({
      data: {
        organizationId: org.id, eventId: EVENT_ID, seatZoneId: paid.id,
        guestName: "Click Test Fan", guestEmail: "clicktest-fan@neonultra.ng", guestPhone: "+2348000000001",
        quantity: 2, unitPriceKobo: paid.priceKobo, totalKobo: total, promoCodeId: promo.id,
        ticket: { create: { code: randomUUID().replaceAll("-", "") } },
      },
      include: { ticket: true },
    });
    if (reservation.ticket) {
      await upsertPublicTokenLocator(c, { tokenType: PublicTokenLocatorType.TICKET, rawToken: reservation.ticket.code, organizationId: org.id, resourceId: reservation.ticket.id });
    }
    // Pass-zone reservation (no promo): 1 x day pass.
    const passRes = await c.seatReservation.create({
      data: {
        organizationId: org.id, eventId: EVENT_ID, seatZoneId: pass.id,
        guestName: "Click Test Fan", guestEmail: "clicktest-pass@neonultra.ng", guestPhone: "+2348000000002",
        quantity: 1, unitPriceKobo: pass.priceKobo, totalKobo: pass.priceKobo,
        ticket: { create: { code: randomUUID().replaceAll("-", "") } },
      },
      include: { ticket: true },
    });
    if (passRes.ticket) {
      await upsertPublicTokenLocator(c, { tokenType: PublicTokenLocatorType.TICKET, rawToken: passRes.ticket.code, organizationId: org.id, resourceId: passRes.ticket.id });
    }
    console.log("RESERVATION:" + JSON.stringify({ totalKobo: reservation.totalKobo, promoCodeId: reservation.promoCodeId, ticket: reservation.ticket?.code }));
    console.log("PASS_RESERVATION:" + JSON.stringify({ totalKobo: passRes.totalKobo, ticket: passRes.ticket?.code }));
    console.log("EMAIL_RESULT:" + JSON.stringify(await emailTicketQr(reservation.ticket!.code)));
    console.log("TICKET_CODES:" + JSON.stringify({ regular: reservation.ticket?.code, pass: passRes.ticket?.code }));
  } finally {
    await c.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
