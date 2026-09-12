// Phase 1, Stage 5.2B-4: database-level proof that all 8 composite foreign keys added in
// migration 20260905060000_phase1_stage5_2b4_vendor_event_reservation_tenant_fk reject a
// cross-organization relation on their own - independent of Row Level Security - by attempting
// each write as the PRIVILEGED role (bypasses RLS entirely: rolsuper/rolbypassrls both true)
// inside a transaction that is always rolled back. Each relation gets its own fresh, entirely
// self-contained fixture (built inside the same rolled-back transaction) rather than depending
// on any existing production/staging row - this stage's own rehearsal found that Neon Ultra
// currently has zero real SeatReservation rows, so a fixture-dependent proof for
// Ticket.reservationId could not have used real data anyway.
//
// Run against `ultraos_staging` connected as the privileged `ultraos` role - never run this
// against production.
import { EventStatus, ProductCategory, SeasonStatus } from "../src/generated/prisma/enums";
import { prisma } from "../src/lib/prisma";
import type { Prisma } from "../src/generated/prisma/client";

async function buildOrgBFixture(tx: Prisma.TransactionClient) {
  const sport = await tx.sport.findFirstOrThrow();
  const orgA = await tx.organization.create({ data: { name: "Privileged FK Proof Org A", slug: `privileged-fk-proof-org-a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, idPrefixAthlete: `QA${Date.now() % 10000}`, idPrefixStaff: `QB${Date.now() % 10000}` } });
  const orgB = await tx.organization.create({ data: { name: "Privileged FK Proof Org B", slug: `privileged-fk-proof-org-b-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, idPrefixAthlete: `QC${Date.now() % 10000}`, idPrefixStaff: `QD${Date.now() % 10000}` } });

  async function buildSide(orgId: string) {
    const competition = await tx.competition.create({ data: { organizationId: orgId, sportId: sport.id, name: "Privileged Proof League", slug: `privileged-proof-league-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` } });
    const season = await tx.season.create({ data: { organizationId: orgId, competitionId: competition.id, name: "Privileged Proof Season", startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"), status: SeasonStatus.ACTIVE } });
    const venue = await tx.venue.create({ data: { organizationId: orgId, name: "Privileged Proof Arena", address: "1 Test Way", city: "Lagos", capacity: 1000 } });
    const event = await tx.event.create({ data: { organizationId: orgId, name: "Privileged Proof Event", date: new Date("2026-06-01"), venueId: venue.id, seasonId: season.id, startTime: new Date("2026-06-01T18:00:00Z"), status: EventStatus.PUBLISHED } });
    const section = await tx.venueSection.create({ data: { organizationId: orgId, venueId: venue.id, name: "Privileged Proof Section", code: "PPS", capacity: 500 } });
    const zone = await tx.seatZone.create({ data: { organizationId: orgId, eventId: event.id, venueSectionId: section.id, name: "Privileged Proof Zone", capacity: 100, priceKobo: 100000 } });
    const reservation = await tx.seatReservation.create({ data: { organizationId: orgId, eventId: event.id, seatZoneId: zone.id, guestName: "x", guestEmail: `x-${Date.now()}@example.test`, guestPhone: "+2340000000000", unitPriceKobo: 0, totalKobo: 0 } });
    const vendor = await tx.vendor.create({ data: { organizationId: orgId, name: "Privileged Proof Vendor" } });
    const product = await tx.vendorProduct.create({ data: { organizationId: orgId, vendorId: vendor.id, name: "Privileged Proof Product", category: ProductCategory.OTHER, priceKobo: 1000 } });
    const order = await tx.order.create({ data: { organizationId: orgId, eventId: event.id, subtotalKobo: 0, totalKobo: 0, collectionCode: `privileged-proof-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` } });
    return { venue, event, zone, reservation, vendor, product, order };
  }

  return { orgA: await buildSide(orgA.id), orgB: await buildSide(orgB.id) };
}

type Attempt = {
  relation: string;
  constraintName: string;
  run: (tx: Prisma.TransactionClient) => Promise<unknown>;
};

const attempts: Attempt[] = [
  {
    relation: "Event.venueId",
    constraintName: "Event_organizationId_venueId_fkey",
    run: async (tx) => {
      const f = await buildOrgBFixture(tx);
      return tx.event.create({ data: { organizationId: f.orgB.event.organizationId, name: "x", date: new Date(), venueId: f.orgA.venue.id, seasonId: f.orgB.event.seasonId, startTime: new Date() } });
    },
  },
  {
    relation: "VendorProduct.vendorId",
    constraintName: "VendorProduct_organizationId_vendorId_fkey",
    run: async (tx) => {
      const f = await buildOrgBFixture(tx);
      return tx.vendorProduct.create({ data: { organizationId: f.orgB.vendor.organizationId, vendorId: f.orgA.vendor.id, name: "x", category: ProductCategory.OTHER, priceKobo: 1 } });
    },
  },
  {
    relation: "VendorInventory.eventId",
    constraintName: "VendorInventory_organizationId_eventId_fkey",
    run: async (tx) => {
      const f = await buildOrgBFixture(tx);
      return tx.vendorInventory.create({ data: { organizationId: f.orgB.product.organizationId, eventId: f.orgA.event.id, productId: f.orgB.product.id, stock: 1 } });
    },
  },
  {
    relation: "VendorInventory.productId",
    constraintName: "VendorInventory_organizationId_productId_fkey",
    run: async (tx) => {
      const f = await buildOrgBFixture(tx);
      return tx.vendorInventory.create({ data: { organizationId: f.orgB.event.organizationId, eventId: f.orgB.event.id, productId: f.orgA.product.id, stock: 1 } });
    },
  },
  {
    relation: "SeatReservation.eventId",
    constraintName: "SeatReservation_organizationId_eventId_fkey",
    run: async (tx) => {
      const f = await buildOrgBFixture(tx);
      return tx.seatReservation.create({ data: { organizationId: f.orgB.zone.organizationId, eventId: f.orgA.event.id, seatZoneId: f.orgB.zone.id, guestName: "x", guestEmail: `x-${Date.now()}@example.test`, guestPhone: "+2340000000000", unitPriceKobo: 0, totalKobo: 0 } });
    },
  },
  {
    relation: "SeatReservation.seatZoneId",
    constraintName: "SeatReservation_organizationId_seatZoneId_fkey",
    run: async (tx) => {
      const f = await buildOrgBFixture(tx);
      return tx.seatReservation.create({ data: { organizationId: f.orgB.event.organizationId, eventId: f.orgB.event.id, seatZoneId: f.orgA.zone.id, guestName: "x", guestEmail: `x-${Date.now()}@example.test`, guestPhone: "+2340000000000", unitPriceKobo: 0, totalKobo: 0 } });
    },
  },
  {
    relation: "Ticket.reservationId",
    constraintName: "Ticket_organizationId_reservationId_fkey",
    run: async (tx) => {
      const f = await buildOrgBFixture(tx);
      return tx.ticket.create({ data: { organizationId: f.orgB.reservation.organizationId, reservationId: f.orgA.reservation.id, code: `privileged-proof-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` } });
    },
  },
  {
    relation: "OrderItem.productId",
    constraintName: "OrderItem_organizationId_productId_fkey",
    run: async (tx) => {
      const f = await buildOrgBFixture(tx);
      return tx.orderItem.create({ data: { organizationId: f.orgB.order.organizationId, orderId: f.orgB.order.id, productId: f.orgA.product.id, quantity: 1, unitPriceKobo: 1, totalKobo: 1 } });
    },
  },
];

async function main() {
  const roleCheck = await prisma.$queryRaw<{ rolsuper: boolean; rolbypassrls: boolean }[]>`select rolsuper, rolbypassrls from pg_roles where rolname = current_user`;
  const privileged = roleCheck[0]?.rolsuper && roleCheck[0]?.rolbypassrls;
  console.log(`Connected role bypasses RLS: ${privileged ? "YES" : "NO"} (rolsuper=${roleCheck[0]?.rolsuper}, rolbypassrls=${roleCheck[0]?.rolbypassrls})`);
  if (!privileged) {
    console.error("REFUSING TO PROCEED: this script must be run as the privileged, RLS-bypassing role - a restricted role would make this proof meaningless.");
    process.exitCode = 1;
    return;
  }

  for (const attempt of attempts) {
    let rejectionMessage = "";
    let constraintRejected = false;
    try {
      await prisma.$transaction(async (tx) => {
        await attempt.run(tx);
        throw new Error("UNEXPECTED_SUCCESS");
      });
    } catch (error) {
      rejectionMessage = error instanceof Error ? error.message : String(error);
      constraintRejected = rejectionMessage.includes(attempt.constraintName);
    }
    if (rejectionMessage === "UNEXPECTED_SUCCESS") {
      console.log(`FAIL: ${attempt.relation} - cross-org write under the privileged role succeeded (composite FK did not reject it).`);
    } else if (constraintRejected) {
      console.log(`PASS: ${attempt.relation} - privileged role's cross-org write rejected by ${attempt.constraintName}, not RLS.`);
    } else {
      console.log(`INCONCLUSIVE: ${attempt.relation} - transaction failed, but not on the expected constraint (${attempt.constraintName}). Observed: ${rejectionMessage.split("\n").pop()}`);
    }
  }

  console.log("\nEvery transaction above rolled back on its own thrown error - nothing was committed.");
  const residualOrgs = await prisma.organization.count({ where: { slug: { startsWith: "privileged-fk-proof-org-" } } });
  console.log(`Residue check: ${residualOrgs} leftover "Privileged FK Proof Org" rows (expect 0, since every transaction rolled back).`);
}

main()
  .catch((error) => {
    console.error("SCRIPT FAILED:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
