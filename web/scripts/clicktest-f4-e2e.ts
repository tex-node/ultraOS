import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { reserveZone } from "../src/app/public/events/actions";
import { emailTicketQr } from "../src/app/public/tickets/actions";

const EVENT_ID = "seed-event-season-zero-launch";
const EVENT_PUBLIC_KEY = "seed-event-season-zero-launch";

async function main() {
  const c = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    const org = await c.organization.findUniqueOrThrow({ where: { slug: "neon-ultra" }, select: { id: true } });
    const section = await c.venueSection.findFirstOrThrow({ where: { id: "seed-section-general" }, select: { id: true } });

    const paid = await c.seatZone.upsert({
      where: { eventId_name: { eventId: EVENT_ID, name: "Click-Test Paid" } },
      create: { organizationId: org.id, eventId: EVENT_ID, venueSectionId: section.id, name: "Click-Test Paid", capacity: 50, priceKobo: 100000 },
      update: { priceKobo: 100000 },
      select: { id: true },
    });
    const pass = await c.seatZone.upsert({
      where: { eventId_name: { eventId: EVENT_ID, name: "Click-Test Day Pass" } },
      create: { organizationId: org.id, eventId: EVENT_ID, venueSectionId: section.id, name: "Click-Test Day Pass", capacity: 30, priceKobo: 250000, passTier: "DAY_PASS", passValidFrom: new Date("2026-09-20T00:00:00.000Z"), passValidTo: new Date("2026-09-27T23:59:59.000Z") },
      update: { passTier: "DAY_PASS" },
      select: { id: true },
    });
    const promo = await c.promoCode.upsert({
      where: { code: "CLICKTEST20" },
      create: { organizationId: org.id, eventId: EVENT_ID, code: "CLICKTEST20", description: "F4 click-through test", discountBps: 2000, maxRedemptions: 5 },
      update: { discountBps: 2000, maxRedemptions: 5, isActive: true },
      select: { id: true },
    });
    console.log("SETUP:" + JSON.stringify({ paid: paid.id, pass: pass.id, promo: promo.id }));

    // 1. Guest reservation with lowercase promo code (2 x NGN1000 - 20% = NGN1600).
    const fd = new FormData();
    fd.set("seatZoneId", paid.id);
    fd.set("quantity", "2");
    fd.set("guestName", "Click Test Fan");
    fd.set("guestEmail", "clicktest-fan@neonultra.ng");
    fd.set("guestPhone", "+2348000000001");
    fd.set("promoCode", "clicktest20");
    let ticketCode: string | null = null;
    try {
      await reserveZone(EVENT_PUBLIC_KEY, fd);
      console.log("RESERVE: no redirect (UNEXPECTED)");
    } catch (error) {
      const digest = error instanceof Error ? (error as Error & { digest?: string }).digest ?? String(error) : String(error);
      const match = /\/public\/tickets\/([A-Za-z0-9]+)/.exec(digest);
      ticketCode = match?.[1] ?? null;
      console.log("RESERVE_REDIRECT:" + (ticketCode ? `ticket ${ticketCode}` : digest.slice(0, 120)));
    }

    const reservation = await c.seatReservation.findFirst({
      where: { guestEmail: "clicktest-fan@neonultra.ng" },
      orderBy: { createdAt: "desc" },
      select: { id: true, quantity: true, unitPriceKobo: true, totalKobo: true, promoCodeId: true, paymentStatus: true, ticket: { select: { code: true, status: true } } },
    });
    const promoAfter = await c.promoCode.findUniqueOrThrow({ where: { id: promo.id }, select: { redemptionCount: true } });
    console.log("RESERVATION:" + JSON.stringify(reservation));
    console.log("PROMO_COUNT:" + promoAfter.redemptionCount);
    const promoOk = reservation?.totalKobo === 160000 && reservation?.promoCodeId === promo.id && promoAfter.redemptionCount >= 1;
    console.log("PROMO_APPLIED_CORRECTLY:" + promoOk);

    // 2. Invalid promo must throw without creating anything.
    const before = await c.seatReservation.count({ where: { guestEmail: "clicktest-fan@neonultra.ng" } });
    const bad = new FormData();
    bad.set("seatZoneId", paid.id);
    bad.set("quantity", "1");
    bad.set("guestName", "Click Test Fan");
    bad.set("guestEmail", "clicktest-fan@neonultra.ng");
    bad.set("guestPhone", "+2348000000001");
    bad.set("promoCode", "NOPE-NOPE");
    try {
      await reserveZone(EVENT_PUBLIC_KEY, bad);
      console.log("BAD_PROMO: no throw (UNEXPECTED)");
    } catch (error) {
      console.log("BAD_PROMO_THREW:" + String(error instanceof Error ? error.message : error).slice(0, 60));
    }
    const after = await c.seatReservation.count({ where: { guestEmail: "clicktest-fan@neonultra.ng" } });
    console.log("NO_LEAK_ON_BAD_PROMO:" + (after === before));

    // 3. QR email with no SMTP configured must degrade gracefully.
    if (ticketCode) {
      console.log("EMAIL_RESULT:" + JSON.stringify(await emailTicketQr(ticketCode)));
    }
  } finally {
    await c.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
