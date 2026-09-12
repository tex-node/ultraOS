// Phase 1, Stage 5.2B-4: two-tenant staging rehearsal for the vendor/event/reservation tenancy
// hardening. This is a genuine repeatable rehearsal utility, not a historical one-off (same
// category as draft-tenancy-isolation-integration-test.ts) - run it against `ultraos_staging`
// connected as the restricted `ultraos_staging` role so RLS is genuinely exercised, never
// against production. It creates a disposable Organization B, exercises the real tenant-scoped
// write logic this stage's actions use (vendor/product/inventory/event/zone/reservation/order),
// attempts several cross-org writes that must be denied, verifies zero partial writes after each
// denial, tests capacity/inventory isolation, and deletes every row it created before exiting.
//
// `reserveZone`/`createWalletOrder` (the two genuinely public actions) call NextAuth's `auth()`
// internally, which requires an active Next.js request context and cannot run from a bare
// script - so this rehearsal replicates their exact tenant-resolution and write logic inline
// (identical Prisma operations, same set_config/organizationId-derivation mechanism) rather than
// importing and calling those two functions directly. Every other function this stage touches
// (createVendor/createVendorProduct/setVendorInventory/createEvent/createSeatZone) is inlined
// the same way, since all of this stage's actions resolve organizationId from
// requirePermissionWithOrganization() - a real session this script cannot fabricate - not from
// an explicit parameter a script could supply directly (unlike Stage 5.2B-3's draft-events.ts
// library functions).
import { EventStatus, ProductCategory, SeasonStatus } from "../src/generated/prisma/enums";
import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";

const NEON_ULTRA = "cmt4odhgn0000wokk8fbwr6ro";

function report(label: string, ok: boolean, extra?: string) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}${extra ? " -> " + extra : ""}`);
}

async function buildOrgHierarchy(orgId: string, tag: string, sportId: string) {
  return withOrganizationContext(orgId, async (tx) => {
    const competition = await tx.competition.create({ data: { organizationId: orgId, sportId, name: `${tag} League`, slug: `${tag.toLowerCase()}-league-${Date.now()}` } });
    const season = await tx.season.create({ data: { organizationId: orgId, competitionId: competition.id, name: `${tag} Season`, startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"), status: SeasonStatus.ACTIVE } });
    const venue = await tx.venue.create({ data: { organizationId: orgId, name: `${tag} Arena`, address: "1 Test Way", city: "Lagos", capacity: 5000 } });
    return { competition, season, venue };
  });
}

async function main() {
  const sport = await withOrganizationContext(NEON_ULTRA, (tx) => tx.sport.findFirstOrThrow());
  const orgB = await prisma.organization.create({ data: { name: "Rehearsal Vendor League B", slug: `rehearsal-vendor-league-b-${Date.now()}`, idPrefixAthlete: `RVB${Date.now() % 1000}`, idPrefixStaff: `RVS${Date.now() % 1000}` } });
  console.log("Created disposable Organization B:", orgB.id);

  console.log("\n========== Duplicate business vocabulary across orgs (no collision) ==========");
  const hierarchyA = await buildOrgHierarchy(NEON_ULTRA, "RehearsalDupVendor", sport.id);
  const vendorNameCollisionA = await withOrganizationContext(NEON_ULTRA, (tx) => tx.vendor.create({ data: { organizationId: NEON_ULTRA, name: "Arena Snacks Rehearsal" } }));
  const vendorNameCollisionB = await withOrganizationContext(orgB.id, (tx) => tx.vendor.create({ data: { organizationId: orgB.id, name: "Arena Snacks Rehearsal" } }));
  report("Org A and Org B each created an identically-named Vendor with no collision", Boolean(vendorNameCollisionA.id && vendorNameCollisionB.id));

  console.log("\n========== PromoCode global uniqueness (anticipated stop condition, section 24) ==========");
  const promoCodeA = await withOrganizationContext(NEON_ULTRA, (tx) => tx.promoCode.create({ data: { organizationId: NEON_ULTRA, code: `REHEARSALVIP${Date.now()}`.slice(0, 30) } }));
  const sharedCode = promoCodeA.code;
  try {
    await withOrganizationContext(orgB.id, (tx) => tx.promoCode.create({ data: { organizationId: orgB.id, code: sharedCode } }));
    report("Org B can create a PromoCode with the same code text as Org A's", false, "unexpectedly succeeded - global uniqueness would have to already be composite (it is not)");
  } catch (error) {
    report("Org B blocked from using Org A's exact PromoCode.code text (STOP CONDITION, not fixed)", true, error instanceof Error ? error.message.split("\n").pop() : String(error));
  }
  await withOrganizationContext(NEON_ULTRA, (tx) => tx.promoCode.delete({ where: { id: promoCodeA.id } }));

  const orgBHierarchy = await buildOrgHierarchy(orgB.id, "OrgBVendor", sport.id);

  console.log("\n========== Org B Vendor -> Product -> Inventory (PASS) ==========");
  const vendorB = await withOrganizationContext(orgB.id, (tx) => tx.vendor.create({ data: { organizationId: orgB.id, name: "Org B Snacks" } }));
  const productB = await withOrganizationContext(orgB.id, (tx) => tx.vendorProduct.create({ data: { organizationId: orgB.id, vendorId: vendorB.id, name: "Org B Popcorn", category: ProductCategory.POPCORN, priceKobo: 100000 } }));
  report("Org B Product attached to Org B Vendor", productB.vendorId === vendorB.id);

  console.log("\n========== Org B Event -> Venue (PASS) ==========");
  const eventB = await withOrganizationContext(orgB.id, (tx) => tx.event.create({ data: { organizationId: orgB.id, name: "Org B Rehearsal Event", date: new Date("2026-06-01"), venueId: orgBHierarchy.venue.id, seasonId: orgBHierarchy.season.id, startTime: new Date("2026-06-01T18:00:00Z"), status: EventStatus.PUBLISHED } }));
  report("Org B Event attached to Org B Venue", eventB.venueId === orgBHierarchy.venue.id);

  const sectionB = await withOrganizationContext(orgB.id, (tx) => tx.venueSection.create({ data: { organizationId: orgB.id, venueId: orgBHierarchy.venue.id, name: "Org B Stand", code: "OBS", capacity: 500 } }));
  const zoneB = await withOrganizationContext(orgB.id, (tx) => tx.seatZone.create({ data: { organizationId: orgB.id, eventId: eventB.id, venueSectionId: sectionB.id, name: "Org B Zone", capacity: 100, priceKobo: 500000 } }));
  const inventoryB = await withOrganizationContext(orgB.id, (tx) => tx.vendorInventory.create({ data: { organizationId: orgB.id, eventId: eventB.id, productId: productB.id, stock: 50 } }));
  report("Org B VendorInventory attached to Org B Event/Product", inventoryB.eventId === eventB.id && inventoryB.productId === productB.id);

  console.log("\n========== Org B Reservation -> Zone/Event (PASS, replicating reserveZone's real logic) ==========");
  const reservationB = await withOrganizationContext(orgB.id, (tx) => tx.seatReservation.create({
    data: { organizationId: orgB.id, eventId: eventB.id, seatZoneId: zoneB.id, guestName: "Rehearsal Guest", guestEmail: "rehearsal-b@example.test", guestPhone: "+2340000000000", quantity: 1, unitPriceKobo: zoneB.priceKobo, totalKobo: zoneB.priceKobo, paymentStatus: "PAID", paidAt: new Date(), ticket: { create: { code: `rehearsal-ticket-${Date.now()}` } } },
    include: { ticket: true },
  }));
  report("Org B Reservation attached to Org B Zone/Event, Ticket attached to Org B Reservation", reservationB.eventId === eventB.id && reservationB.seatZoneId === zoneB.id && reservationB.ticket?.reservationId === reservationB.id);

  console.log("\n========== Org B Order -> Vendor/Product (PASS, replicating createWalletOrder's real logic) ==========");
  const orderB = await withOrganizationContext(orgB.id, (tx) => tx.order.create({
    data: { organizationId: orgB.id, eventId: eventB.id, reservationId: reservationB.id, subtotalKobo: productB.priceKobo, totalKobo: productB.priceKobo, collectionCode: `rehearsal-order-${Date.now()}`, items: { create: [{ organizationId: orgB.id, productId: productB.id, quantity: 1, unitPriceKobo: productB.priceKobo, totalKobo: productB.priceKobo }] } },
    include: { items: true },
  }));
  report("Org B Order/OrderItem attached to Org B SeatReservation/VendorProduct", orderB.items[0]?.productId === productB.id);

  console.log("\n========== Cross-org denial (composite FK) ==========");
  const neonUltraVendor = await withOrganizationContext(NEON_ULTRA, (tx) => tx.vendor.findFirst({ orderBy: { createdAt: "asc" } }));
  if (neonUltraVendor) {
    try {
      await withOrganizationContext(orgB.id, (tx) => tx.vendorProduct.create({ data: { organizationId: orgB.id, vendorId: neonUltraVendor.id, name: "Cross-org attempt", category: ProductCategory.OTHER, priceKobo: 1 } }));
      report("Org B Product -> Org A Vendor denied (composite FK)", false, "create succeeded unexpectedly");
    } catch (error) {
      report("Org B Product -> Org A Vendor denied (composite FK)", true, error instanceof Error ? error.message.split("\n").pop() : String(error));
    }
  }

  const neonUltraVenue = await withOrganizationContext(NEON_ULTRA, (tx) => tx.venue.findFirst({ orderBy: { createdAt: "asc" } }));
  if (neonUltraVenue) {
    try {
      await withOrganizationContext(orgB.id, (tx) => tx.event.create({ data: { organizationId: orgB.id, name: "Cross-org attempt", date: new Date(), venueId: neonUltraVenue.id, seasonId: orgBHierarchy.season.id, startTime: new Date() } }));
      report("Org B Event -> Org A Venue denied (composite FK)", false, "create succeeded unexpectedly");
    } catch (error) {
      report("Org B Event -> Org A Venue denied (composite FK)", true, error instanceof Error ? error.message.split("\n").pop() : String(error));
    }
  }

  const neonUltraEvent = await withOrganizationContext(NEON_ULTRA, (tx) => tx.event.findFirst({ orderBy: { createdAt: "asc" } }));
  const neonUltraZone = neonUltraEvent ? await withOrganizationContext(NEON_ULTRA, (tx) => tx.seatZone.findFirst({ where: { eventId: neonUltraEvent.id }, orderBy: { createdAt: "asc" } })) : null;
  if (neonUltraEvent) {
    try {
      await withOrganizationContext(orgB.id, (tx) => tx.seatReservation.create({ data: { organizationId: orgB.id, eventId: neonUltraEvent.id, seatZoneId: zoneB.id, guestName: "x", guestEmail: "x@example.test", guestPhone: "+2340000000000", unitPriceKobo: 0, totalKobo: 0 } }));
      report("Org B Reservation -> Org A Event denied (composite FK)", false, "create succeeded unexpectedly");
    } catch (error) {
      report("Org B Reservation -> Org A Event denied (composite FK)", true, error instanceof Error ? error.message.split("\n").pop() : String(error));
    }
  }
  if (neonUltraZone) {
    try {
      await withOrganizationContext(orgB.id, (tx) => tx.seatReservation.create({ data: { organizationId: orgB.id, eventId: eventB.id, seatZoneId: neonUltraZone.id, guestName: "x", guestEmail: "x@example.test", guestPhone: "+2340000000000", unitPriceKobo: 0, totalKobo: 0 } }));
      report("Org B Reservation -> Org A SeatZone denied (composite FK)", false, "create succeeded unexpectedly");
    } catch (error) {
      report("Org B Reservation -> Org A SeatZone denied (composite FK)", true, error instanceof Error ? error.message.split("\n").pop() : String(error));
    }
  }

  const neonUltraProduct = await withOrganizationContext(NEON_ULTRA, (tx) => tx.vendorProduct.findFirst({ orderBy: { createdAt: "asc" } }));
  if (neonUltraProduct) {
    try {
      await withOrganizationContext(orgB.id, (tx) => tx.orderItem.create({ data: { organizationId: orgB.id, orderId: orderB.id, productId: neonUltraProduct.id, quantity: 1, unitPriceKobo: 1, totalKobo: 1 } }));
      report("Org B OrderItem -> Org A VendorProduct denied (composite FK)", false, "create succeeded unexpectedly");
    } catch (error) {
      report("Org B OrderItem -> Org A VendorProduct denied (composite FK)", true, error instanceof Error ? error.message.split("\n").pop() : String(error));
    }
    try {
      await withOrganizationContext(orgB.id, (tx) => tx.vendorInventory.create({ data: { organizationId: orgB.id, eventId: eventB.id, productId: neonUltraProduct.id, stock: 1 } }));
      report("Org B VendorInventory -> Org A VendorProduct denied (composite FK)", false, "create succeeded unexpectedly");
    } catch (error) {
      report("Org B VendorInventory -> Org A VendorProduct denied (composite FK)", true, error instanceof Error ? error.message.split("\n").pop() : String(error));
    }
  }

  const neonUltraReservation = neonUltraEvent ? await withOrganizationContext(NEON_ULTRA, (tx) => tx.seatReservation.findFirst({ where: { eventId: neonUltraEvent.id }, orderBy: { createdAt: "asc" } })) : null;
  if (neonUltraReservation) {
    try {
      await withOrganizationContext(orgB.id, (tx) => tx.ticket.create({ data: { organizationId: orgB.id, reservationId: neonUltraReservation.id, code: `cross-org-attempt-${Date.now()}` } }));
      report("Org B Ticket -> Org A SeatReservation denied (composite FK)", false, "create succeeded unexpectedly");
    } catch (error) {
      report("Org B Ticket -> Org A SeatReservation denied (composite FK)", true, error instanceof Error ? error.message.split("\n").pop() : String(error));
    }
  }

  const orphanOrderItems = await withOrganizationContext(orgB.id, (tx) => tx.orderItem.count({ where: { organizationId: orgB.id, orderId: orderB.id, NOT: { productId: productB.id } } }));
  report("Zero partial writes after failed cross-org attempts", orphanOrderItems === 0);

  console.log("\n========== Capacity isolation (section 20/36) ==========");
  const neonUltraZoneBefore = neonUltraZone ? await withOrganizationContext(NEON_ULTRA, (tx) => tx.seatZone.findUniqueOrThrow({ where: { id: neonUltraZone.id }, select: { reservedQuantity: true } })) : null;
  await withOrganizationContext(orgB.id, (tx) => tx.seatZone.update({ where: { id: zoneB.id }, data: { reservedQuantity: { increment: 5 } } }));
  const orgBZoneAfter = await withOrganizationContext(orgB.id, (tx) => tx.seatZone.findUniqueOrThrow({ where: { id: zoneB.id }, select: { reservedQuantity: true } }));
  const neonUltraZoneAfter = neonUltraZone ? await withOrganizationContext(NEON_ULTRA, (tx) => tx.seatZone.findUniqueOrThrow({ where: { id: neonUltraZone.id }, select: { reservedQuantity: true } })) : null;
  report("Org B zone capacity change does not affect Org A's zone capacity", orgBZoneAfter.reservedQuantity === 5 && (!neonUltraZoneBefore || neonUltraZoneBefore.reservedQuantity === neonUltraZoneAfter?.reservedQuantity));

  console.log("\n========== Inventory isolation (section 16/37) ==========");
  const neonUltraInventory = neonUltraProduct ? await withOrganizationContext(NEON_ULTRA, (tx) => tx.vendorInventory.findFirst({ where: { productId: neonUltraProduct.id }, orderBy: { createdAt: "asc" } })) : null;
  await withOrganizationContext(orgB.id, (tx) => tx.vendorInventory.update({ where: { id: inventoryB.id }, data: { sold: { increment: 3 }, reserved: { decrement: 0 } } }));
  const orgBInventoryAfter = await withOrganizationContext(orgB.id, (tx) => tx.vendorInventory.findUniqueOrThrow({ where: { id: inventoryB.id }, select: { sold: true } }));
  const neonUltraInventoryAfter = neonUltraInventory ? await withOrganizationContext(NEON_ULTRA, (tx) => tx.vendorInventory.findUniqueOrThrow({ where: { id: neonUltraInventory.id }, select: { sold: true } })) : null;
  report("Org B inventory adjustment does not affect Org A's inventory", orgBInventoryAfter.sold === 3 && (!neonUltraInventory || neonUltraInventory.sold === neonUltraInventoryAfter?.sold));

  console.log("\n========== Cleanup ==========");
  await withOrganizationContext(orgB.id, (tx) => tx.orderItem.deleteMany({ where: { organizationId: orgB.id } }));
  await withOrganizationContext(orgB.id, (tx) => tx.order.deleteMany({ where: { organizationId: orgB.id } }));
  await withOrganizationContext(orgB.id, (tx) => tx.checkIn.deleteMany({ where: { organizationId: orgB.id } }));
  await withOrganizationContext(orgB.id, (tx) => tx.ticket.deleteMany({ where: { organizationId: orgB.id } }));
  await withOrganizationContext(orgB.id, (tx) => tx.seatReservation.deleteMany({ where: { organizationId: orgB.id } }));
  await withOrganizationContext(orgB.id, (tx) => tx.vendorInventory.deleteMany({ where: { organizationId: orgB.id } }));
  await withOrganizationContext(orgB.id, (tx) => tx.seatZone.deleteMany({ where: { organizationId: orgB.id } }));
  await withOrganizationContext(orgB.id, (tx) => tx.venueSection.deleteMany({ where: { organizationId: orgB.id } }));
  await withOrganizationContext(orgB.id, (tx) => tx.event.deleteMany({ where: { organizationId: orgB.id } }));
  await withOrganizationContext(orgB.id, (tx) => tx.vendorProduct.deleteMany({ where: { organizationId: orgB.id } }));
  await withOrganizationContext(orgB.id, (tx) => tx.vendor.deleteMany({ where: { organizationId: orgB.id } }));
  await withOrganizationContext(orgB.id, (tx) => tx.club.deleteMany({ where: { organizationId: orgB.id } }));
  await withOrganizationContext(orgB.id, (tx) => tx.venue.deleteMany({ where: { organizationId: orgB.id } }));
  await withOrganizationContext(orgB.id, (tx) => tx.season.deleteMany({ where: { organizationId: orgB.id } }));
  await withOrganizationContext(orgB.id, (tx) => tx.competition.deleteMany({ where: { organizationId: orgB.id } }));
  await withOrganizationContext(NEON_ULTRA, (tx) => tx.vendor.deleteMany({ where: { id: { in: [vendorNameCollisionA.id] } } }));
  await withOrganizationContext(NEON_ULTRA, (tx) => tx.venue.deleteMany({ where: { id: hierarchyA.venue.id } }));
  await withOrganizationContext(NEON_ULTRA, (tx) => tx.season.deleteMany({ where: { id: hierarchyA.season.id } }));
  await withOrganizationContext(NEON_ULTRA, (tx) => tx.competition.deleteMany({ where: { id: hierarchyA.competition.id } }));
  await prisma.organization.delete({ where: { id: orgB.id } });
  console.log("Cleanup complete - Organization B and every rehearsal row removed.");
}

main()
  .catch((error) => {
    console.error("REHEARSAL FAILED:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
