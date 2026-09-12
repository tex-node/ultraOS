// Phase 1, Stage 5.5B Batch 4: repeatable Org A / Org B empirical tenant-isolation proof for the
// Events / Reservations / Ticketing / Orders / Vendor-inventory / Check-in domain. Run against
// `ultraos_staging`, connected as the restricted `ultraos_staging` role (NOSUPERUSER,
// NOBYPASSRLS) - never against production, never as the privileged `ultraos`/migrate.env role,
// which would make every "denied" result meaningless (Postgres never applies row security to a
// superuser or a BYPASSRLS role).
//
// This does not re-implement the write logic already proven in Stage 5.2B-4/5.5A from scratch -
// it replicates the exact same inline logic those two genuinely-public actions
// (public/events/actions.ts's reserveZone, public/tickets/actions.ts's createWalletOrder) use,
// since both call NextAuth's auth() and cannot run from a bare script - same precedent as
// vendor-event-reservation-tenancy-isolation-integration-test.ts. Every deliberately-failing
// negative test runs in its own transaction (Postgres aborts an entire transaction on the first
// failed statement, 25P02 - Stage 5.2C's rehearsal lesson). Org A and Org B events are given the
// IDENTICAL name "Tenant Isolation Test Event" on purpose (section 26) so a pass can never be
// explained by names happening to be globally unique. Every sentinel row created here is deleted
// before exit, and a final residue check proves zero left behind.
import { randomUUID } from "node:crypto";
import { Prisma } from "../src/generated/prisma/client";
import {
  EventStatus,
  PublicResourceLocatorType,
  PublicTokenLocatorType,
  SeasonStatus,
} from "../src/generated/prisma/enums";
import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";
import {
  resolvePublicTokenLocator,
  upsertPublicResourceLocator,
  upsertPublicTokenLocator,
} from "../src/lib/public-locators";

type ProofRow = {
  id: string;
  scenario: string;
  expected: string;
  actual: string;
  result: "PASS" | "FAIL";
};

const proofs: ProofRow[] = [];
let proofSeq = 0;
function record(prefix: string, scenario: string, expected: string, ok: boolean, actual: string) {
  proofSeq += 1;
  const id = `${prefix}-${String(proofSeq).padStart(3, "0")}`;
  proofs.push({ id, scenario, expected, actual, result: ok ? "PASS" : "FAIL" });
  console.log(`${ok ? "PASS" : "FAIL"} [${id}] ${scenario} -- expected: ${expected} -- actual: ${actual}`);
  return ok;
}

async function main() {
  const roleCheck = await prisma.$queryRaw<{ rolsuper: boolean; rolbypassrls: boolean }[]>`select rolsuper, rolbypassrls from pg_roles where rolname = current_user`;
  const restricted = roleCheck[0] && !roleCheck[0].rolsuper && !roleCheck[0].rolbypassrls;
  console.log(`Connected role bypasses RLS: ${restricted ? "NO (restricted, correct)" : "YES -- REFUSING"} (rolsuper=${roleCheck[0]?.rolsuper}, rolbypassrls=${roleCheck[0]?.rolbypassrls})`);
  if (!restricted) {
    console.error("REFUSING TO PROCEED: this proof must run as the restricted role, or every denial result would be meaningless.");
    process.exitCode = 1;
    return;
  }

  const stamp = Date.now();
  const sport = await prisma.sport.findFirstOrThrow();

  async function buildOrg(tag: string) {
    const org = await prisma.organization.create({
      data: {
        name: `Stage 5.5B Batch 4 Proof ${tag}`,
        slug: `stage55b-batch4-${tag.toLowerCase()}-${stamp}`,
        idPrefixAthlete: `${tag}A${stamp % 1000}`,
        idPrefixStaff: `${tag}S${stamp % 1000}`,
      },
    });
    return withOrganizationContext(org.id, async (tx) => {
      const competition = await tx.competition.create({ data: { organizationId: org.id, sportId: sport.id, name: `${tag} League`, slug: `${tag.toLowerCase()}-league-${stamp}` } });
      const season = await tx.season.create({ data: { organizationId: org.id, competitionId: competition.id, name: `${tag} Season`, startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"), status: SeasonStatus.ACTIVE } });
      const venue = await tx.venue.create({ data: { organizationId: org.id, name: `${tag} Arena`, address: "1 Test Way", city: "Lagos", capacity: 5000 } });
      const club = await tx.club.create({ data: { organizationId: org.id, sportId: sport.id, name: `${tag} Club`, shortName: tag.slice(0, 3).toUpperCase(), status: "ACTIVE", brandingStatus: "BRANDING_INCOMPLETE" } });
      const fanClub = await tx.fanClub.create({ data: { organizationId: org.id, clubId: club.id, name: `${tag} Faithful`, captainName: "Test Captain", description: "Proof fixture" } });
      const fan = await tx.user.create({ data: { email: `stage55b-batch4-fan-${tag.toLowerCase()}-${stamp}@example.test`, name: `${tag} Fan`, role: "FAN" } });
      const venueSection = await tx.venueSection.create({ data: { organizationId: org.id, venueId: venue.id, name: "Lower Bowl", code: "LB", capacity: 500 } });
      const event = await tx.event.create({ data: { organizationId: org.id, name: "Tenant Isolation Test Event", date: new Date("2026-10-01"), venueId: venue.id, seasonId: season.id, startTime: new Date("2026-10-01T18:00:00Z"), status: EventStatus.PUBLISHED } });
      await upsertPublicResourceLocator(tx, { resourceType: PublicResourceLocatorType.EVENT, publicKey: event.id, organizationId: org.id, resourceId: event.id });
      const seatZone = await tx.seatZone.create({ data: { organizationId: org.id, eventId: event.id, venueSectionId: venueSection.id, name: "GA", capacity: 100, priceKobo: 500000 } });
      const vendor = await tx.vendor.create({ data: { organizationId: org.id, name: `${tag} Snacks` } });
      const product = await tx.vendorProduct.create({ data: { organizationId: org.id, vendorId: vendor.id, name: "Popcorn", category: "POPCORN", priceKobo: 100000 } });
      const inventory = await tx.vendorInventory.create({ data: { organizationId: org.id, eventId: event.id, productId: product.id, stock: 50 } });
      return { org, competition, season, venue, venueSection, club, fanClub, fan, event, seatZone, vendor, product, inventory };
    });
  }

  console.log("\n========== Fixture setup (Org A, Org B; colliding Event name by design) ==========");
  const a = await buildOrg("A");
  const b = await buildOrg("B");
  console.log(`Org A: ${a.org.id}  Org B: ${b.org.id}  Event A: ${a.event.id}  Event B: ${b.event.id}`);

  // ---- Replicated reserveZone() logic (real code path, inlined - cannot call auth()) ----
  async function reserveZoneAs(orgId: string, eventId: string, seatZoneId: string, guestTag: string) {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_org_id', ${orgId}, true)`;
      const zone = await tx.seatZone.findFirstOrThrow({ where: { id: seatZoneId, eventId, isActive: true }, include: { event: true } });
      await tx.seatZone.update({ where: { id: zone.id }, data: { reservedQuantity: { increment: 1 } } });
      const reservation = await tx.seatReservation.create({
        data: {
          organizationId: orgId,
          eventId,
          seatZoneId: zone.id,
          guestName: `${guestTag} Guest`,
          guestEmail: `stage55b-${guestTag.toLowerCase()}-${stamp}@example.test`,
          guestPhone: "+2340000000000",
          quantity: 1,
          unitPriceKobo: zone.priceKobo,
          totalKobo: zone.priceKobo,
          paymentStatus: "PAID",
          paidAt: new Date(),
          ticket: { create: { code: randomUUID().replaceAll("-", "") } },
        },
        include: { ticket: true },
      });
      await upsertPublicTokenLocator(tx, { tokenType: PublicTokenLocatorType.TICKET, rawToken: reservation.ticket!.code, organizationId: orgId, resourceId: reservation.ticket!.id });
      return reservation;
    });
  }

  console.log("\n========== EVT: Event read isolation ==========");
  const eventAOwn = await withOrganizationContext(a.org.id, (tx) => tx.event.findUnique({ where: { id: a.event.id } }));
  record("EVT", "Org A reads its own Event", "found, name matches", Boolean(eventAOwn && eventAOwn.name === "Tenant Isolation Test Event"), JSON.stringify({ found: Boolean(eventAOwn), name: eventAOwn?.name }));
  const eventBOwn = await withOrganizationContext(b.org.id, (tx) => tx.event.findUnique({ where: { id: b.event.id } }));
  record("EVT", "Org B reads its own (identically-named) Event", "found, distinct id from Event A", Boolean(eventBOwn && eventBOwn.id !== a.event.id), JSON.stringify({ found: Boolean(eventBOwn), id: eventBOwn?.id }));
  const crossEventRead = await withOrganizationContext(b.org.id, (tx) => tx.event.findUnique({ where: { id: a.event.id } }));
  record("EVT", "Org B reads Org A's Event by real id", "denied (null)", crossEventRead === null, JSON.stringify(crossEventRead));

  console.log("\n========== EVT: cross-org Event+Venue (createEvent's own guard, replicated) ==========");
  try {
    await withOrganizationContext(a.org.id, async (tx) => {
      // Exact guard createEvent uses before the create: a scoped findUniqueOrThrow on the
      // client-submitted venueId, under Org A's context, before ever attempting the Event create.
      await tx.venue.findUniqueOrThrow({ where: { id: b.venue.id }, select: { id: true } });
    });
    record("EVT", "Event A + Venue B (createEvent's own scoped guard)", "denied before create (Org B's venue invisible under Org A context)", false, "guard unexpectedly found Org B's venue under Org A context");
  } catch (error) {
    const isNotFound = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
    record("EVT", "Event A + Venue B (createEvent's own scoped guard)", "denied before create (Org B's venue invisible under Org A context)", isNotFound, isNotFound ? "P2025 (record not found), as expected" : String((error as Error).message ?? error).slice(0, 200));
  }

  console.log("\n========== RES: Reservation creation and isolation ==========");
  const reservationA = await reserveZoneAs(a.org.id, a.event.id, a.seatZone.id, "OrgA");
  record("RES", "Org A reservation create (reserveZone logic)", "PASS, ticket issued", Boolean(reservationA.ticket), JSON.stringify({ reservationId: reservationA.id, ticketCode: "[redacted]" }));
  const reservationB = await reserveZoneAs(b.org.id, b.event.id, b.seatZone.id, "OrgB");
  record("RES", "Org B reservation create (reserveZone logic)", "PASS, ticket issued", Boolean(reservationB.ticket), JSON.stringify({ reservationId: reservationB.id, ticketCode: "[redacted]" }));

  const orgBReadsOrgAReservation = await withOrganizationContext(b.org.id, (tx) => tx.seatReservation.findUnique({ where: { id: reservationA.id } }));
  record("RES", "Org B reads Org A's reservation by real id", "denied (null)", orgBReadsOrgAReservation === null, JSON.stringify(orgBReadsOrgAReservation));

  const orgBUpdateOrgAReservation = await withOrganizationContext(b.org.id, (tx) => tx.seatReservation.updateMany({ where: { id: reservationA.id }, data: { paymentStatus: "UNPAID" } }));
  record("RES", "Org B updates Org A's reservation (paymentStatus)", "0 rows affected", orgBUpdateOrgAReservation.count === 0, JSON.stringify(orgBUpdateOrgAReservation));
  const reservationAAfterAttack = await withOrganizationContext(a.org.id, (tx) => tx.seatReservation.findUniqueOrThrow({ where: { id: reservationA.id } }));
  record("RES", "Org A's reservation state after Org B's failed update", "unchanged (still PAID)", reservationAAfterAttack.paymentStatus === "PAID", reservationAAfterAttack.paymentStatus);

  const orgBCancelOrgAReservation = await withOrganizationContext(b.org.id, (tx) => tx.seatReservation.deleteMany({ where: { id: reservationA.id } }));
  record("RES", "Org B cancels (deletes) Org A's reservation", "0 rows affected", orgBCancelOrgAReservation.count === 0, JSON.stringify(orgBCancelOrgAReservation));

  console.log("\n========== RES: cross-org Event/SeatZone combination (composite FK) ==========");
  try {
    await withOrganizationContext(b.org.id, (tx) =>
      tx.seatReservation.create({
        data: {
          organizationId: b.org.id,
          eventId: a.event.id,
          seatZoneId: a.seatZone.id,
          guestName: "Attack Guest",
          guestEmail: `stage55b-attack-${stamp}@example.test`,
          guestPhone: "+2340000000000",
          quantity: 1,
          unitPriceKobo: 1,
          totalKobo: 1,
          paymentStatus: "PAID",
        },
      }),
    );
    record("RES", "Org B creates SeatReservation forging organizationId=B against Event A + SeatZone A", "denied (composite FK)", false, "create unexpectedly succeeded");
  } catch (error) {
    record("RES", "Org B creates SeatReservation forging organizationId=B against Event A + SeatZone A", "denied (composite FK)", String((error as Error).message).includes("Foreign key constraint"), String((error as Error).message).slice(0, 160));
  }

  console.log("\n========== TKT: ticket lookup via public locator ==========");
  const ticketLocatorA = await resolvePublicTokenLocator(prisma, PublicTokenLocatorType.TICKET, reservationA.ticket!.code);
  record("TKT", "Org A ticket code resolves via PublicTokenLocator", "resolves to Org A", ticketLocatorA?.organizationId === a.org.id, JSON.stringify({ resolvedOrg: ticketLocatorA?.organizationId === a.org.id ? "A" : ticketLocatorA?.organizationId }));
  const unknownTicket = await resolvePublicTokenLocator(prisma, PublicTokenLocatorType.TICKET, "not-a-real-code-" + stamp);
  record("TKT", "Unknown ticket code lookup", "fails closed (null)", unknownTicket === null, JSON.stringify(unknownTicket));
  const alteredTicket = await resolvePublicTokenLocator(prisma, PublicTokenLocatorType.TICKET, reservationA.ticket!.code.slice(0, -1) + "0");
  record("TKT", "Altered (last char flipped) Org A ticket code lookup", "fails closed (null)", alteredTicket === null, JSON.stringify(alteredTicket));
  const wrongTypeTicket = await resolvePublicTokenLocator(prisma, PublicTokenLocatorType.ORDER, reservationA.ticket!.code);
  record("TKT", "Org A ticket code looked up as ORDER type", "fails closed (null)", wrongTypeTicket === null, JSON.stringify(wrongTypeTicket));

  console.log("\n========== QR/CHECK-IN: authenticated operator read scoping (check-in/[code]/page.tsx logic) ==========");
  const orgBOperatorReadsOrgATicket = await withOrganizationContext(b.org.id, (tx) => tx.ticket.findUnique({ where: { code: reservationA.ticket!.code } }));
  record("QR", "Org B check-in operator looks up Org A's real ticket code", "denied (null, RLS)", orgBOperatorReadsOrgATicket === null, JSON.stringify(orgBOperatorReadsOrgATicket));
  const orgAOperatorReadsOwnTicket = await withOrganizationContext(a.org.id, (tx) => tx.ticket.findUnique({ where: { code: reservationA.ticket!.code } }));
  record("QR", "Org A check-in operator looks up its own real ticket code", "found", orgAOperatorReadsOwnTicket !== null, JSON.stringify({ found: orgAOperatorReadsOwnTicket !== null }));

  console.log("\n========== ORD: order creation and cross-org denial (createWalletOrder logic) ==========");
  const orderA = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_org_id', ${a.org.id}, true)`;
    const ticket = await tx.ticket.findUniqueOrThrow({ where: { id: reservationA.ticket!.id }, include: { reservation: true } });
    const order = await tx.order.create({
      data: {
        organizationId: a.org.id,
        eventId: ticket.reservation.eventId,
        reservationId: ticket.reservation.id,
        subtotalKobo: 0,
        totalKobo: 0,
        paymentStatus: "PENDING",
        status: "PENDING_PAYMENT",
        collectionCode: randomUUID().replaceAll("-", ""),
      },
    });
    await upsertPublicTokenLocator(tx, { tokenType: PublicTokenLocatorType.ORDER, rawToken: order.collectionCode, organizationId: a.org.id, resourceId: order.id });
    return order;
  });
  record("ORD", "Org A order create (createWalletOrder logic)", "PASS", Boolean(orderA.id), JSON.stringify({ orderId: orderA.id }));

  const orgBReadsOrgAOrder = await withOrganizationContext(b.org.id, (tx) => tx.order.findUnique({ where: { collectionCode: orderA.collectionCode } }));
  record("ORD", "Org B reads Org A's order by real collectionCode", "denied (null)", orgBReadsOrgAOrder === null, JSON.stringify(orgBReadsOrgAOrder));

  const orgBCollectsOrgAOrder = await withOrganizationContext(b.org.id, (tx) => tx.order.updateMany({ where: { collectionCode: orderA.collectionCode }, data: { status: "COLLECTED" } }));
  record("ORD", "Org B attempts to collect Org A's order", "0 rows affected", orgBCollectsOrgAOrder.count === 0, JSON.stringify(orgBCollectsOrgAOrder));

  console.log("\n========== VendorInventory: cross-org Event/Product composite FK ==========");
  try {
    await withOrganizationContext(b.org.id, (tx) =>
      tx.vendorInventory.create({ data: { organizationId: b.org.id, eventId: a.event.id, productId: b.product.id, stock: 1 } }),
    );
    record("VND", "Org B VendorInventory forging eventId=Event A", "denied (composite FK)", false, "create unexpectedly succeeded");
  } catch (error) {
    record("VND", "Org B VendorInventory forging eventId=Event A", "denied (composite FK)", String((error as Error).message).includes("Foreign key constraint"), String((error as Error).message).slice(0, 160));
  }

  console.log("\n========== Atomic rollback / no-partial-write proof ==========");
  const zoneAAfter = await withOrganizationContext(a.org.id, (tx) => tx.seatZone.findUniqueOrThrow({ where: { id: a.seatZone.id } }));
  record("ATM", "Org A SeatZone.reservedQuantity after every Org B cross-org attempt", "1 (only Org A's own real reservation; every attack was rejected before touching this row)", zoneAAfter.reservedQuantity === 1, `reservedQuantity=${zoneAAfter.reservedQuantity}`);
  const orphanReservationCount = await withOrganizationContext(b.org.id, (tx) => tx.seatReservation.count({ where: { eventId: a.event.id } }));
  record("ATM", "Org B context sees zero reservations against Event A after every failed attempt", "0", orphanReservationCount === 0, String(orphanReservationCount));

  console.log("\n========== PUB: public bootstrap resolves both tenants ==========");
  const pubA = await resolvePublicTokenLocator(prisma, PublicTokenLocatorType.TICKET, reservationA.ticket!.code);
  const pubB = await resolvePublicTokenLocator(prisma, PublicTokenLocatorType.TICKET, reservationB.ticket!.code);
  record("PUB", "Public bootstrap resolves Org A ticket to Org A", "true", pubA?.organizationId === a.org.id, String(pubA?.organizationId === a.org.id));
  record("PUB", "Public bootstrap resolves Org B ticket to Org B", "true", pubB?.organizationId === b.org.id, String(pubB?.organizationId === b.org.id));

  console.log("\n========== CACHE / SOCKET / JOB isolation ==========");
  console.log("NOT_APPLICABLE: repository-wide scan found no socket.io/websocket layer, no cron/queue/background-job scheduler, and no custom tenant-relevant cache layer (only the OS-level ultraos-backup.timer, which is platform infrastructure, not tenant data). Nothing to test; not claimed as tested.");

  console.log("\n========== Cleanup ==========");
  for (const org of [a, b]) {
    await withOrganizationContext(org.org.id, async (tx) => {
      await tx.order.deleteMany({ where: { eventId: org.event.id } });
      await tx.orderItem.deleteMany({ where: { organizationId: org.org.id } });
      await tx.ticket.deleteMany({ where: { reservation: { eventId: org.event.id } } });
      await tx.seatReservation.deleteMany({ where: { eventId: org.event.id } });
      await tx.vendorInventory.deleteMany({ where: { eventId: org.event.id } });
      await tx.vendorProduct.deleteMany({ where: { vendorId: org.vendor.id } });
      await tx.vendor.deleteMany({ where: { id: org.vendor.id } });
      await tx.seatZone.deleteMany({ where: { eventId: org.event.id } });
      await tx.venueSection.deleteMany({ where: { venueId: org.venue.id } });
      await tx.publicResourceLocator.deleteMany({ where: { organizationId: org.org.id } });
      await tx.publicTokenLocator.deleteMany({ where: { organizationId: org.org.id } });
      await tx.event.deleteMany({ where: { id: org.event.id } });
      await tx.fanMembership.deleteMany({ where: { fanClubId: org.fanClub.id } });
      await tx.fanClub.deleteMany({ where: { id: org.fanClub.id } });
      await tx.club.deleteMany({ where: { id: org.club.id } });
      await tx.season.deleteMany({ where: { id: org.season.id } });
      await tx.competition.deleteMany({ where: { id: org.competition.id } });
      await tx.venue.deleteMany({ where: { id: org.venue.id } });
    });
    await prisma.user.deleteMany({ where: { id: org.fan.id } });
    await prisma.organization.delete({ where: { id: org.org.id } });
  }
  const residueOrgs = await prisma.organization.count({ where: { slug: { startsWith: `stage55b-batch4-` } } });
  record("CLN", "Residue: disposable Organizations remaining", "0", residueOrgs === 0, String(residueOrgs));
  const residueUsers = await prisma.user.count({ where: { email: { startsWith: `stage55b-batch4-` } } });
  record("CLN", "Residue: disposable Users remaining", "0", residueUsers === 0, String(residueUsers));
  const residueResourceLocators = await prisma.publicResourceLocator.count({ where: { organizationId: { in: [a.org.id, b.org.id] } } });
  const residueTokenLocators = await prisma.publicTokenLocator.count({ where: { organizationId: { in: [a.org.id, b.org.id] } } });
  record("CLN", "Residue: locator rows left pointing at deleted sentinel orgs", "0 and 0", residueResourceLocators === 0 && residueTokenLocators === 0, JSON.stringify({ residueResourceLocators, residueTokenLocators }));

  console.log("\n========== SUMMARY ==========");
  const failed = proofs.filter((p) => p.result === "FAIL");
  console.log(`${proofs.length} proofs run, ${proofs.length - failed.length} PASS, ${failed.length} FAIL`);
  if (failed.length) {
    console.log("FAILED:", failed.map((p) => p.id).join(", "));
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("PROOF SCRIPT ERROR:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
