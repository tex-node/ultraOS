import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  MediaAssetPurpose,
  MediaAssetStatus,
  MediaStorageProvider,
  MediaVisibility,
  PublicLocatorStatus,
  PublicResourceLocatorType,
  PublicTokenLocatorType,
  RecordOrigin,
} from "../src/generated/prisma/enums";
import {
  hashPublicToken,
  locatorMatchesResource,
  resolvePublicResourceLocator,
  resolvePublicTokenLocator,
  upsertPublicResourceLocator,
  upsertPublicTokenLocator,
} from "../src/lib/public-locators";

const baseUrl = process.env.STAGE55A_BASE_URL ?? "http://127.0.0.1:4120";
const runTag = `stage55a-${Date.now()}-${randomUUID().slice(0, 8)}`;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

type CheckStatus = "PASS" | "FAIL" | "INFO";
type Check = { name: string; status: CheckStatus; details?: unknown };
const checks: Check[] = [];

function record(name: string, status: CheckStatus, details?: unknown) {
  checks.push({ name, status, details });
}

function assertCheck(name: string, condition: unknown, details?: unknown) {
  record(name, condition ? "PASS" : "FAIL", details);
}

async function withOrg<T>(organizationId: string, fn: Parameters<PrismaClient["$transaction"]>[0] extends (tx: infer Tx) => unknown ? (tx: Tx) => Promise<T> : never) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_org_id', ${organizationId}, true)`;
    return fn(tx as never);
  });
}

function mediaRoot() {
  return process.env.MEDIA_LOCAL_ROOT || "/opt/ultraos-staging/shared/media";
}

async function cleanup() {
  const orgs = await prisma.organization.findMany({
    where: { slug: { startsWith: runTag } },
    select: { id: true },
  });
  const orgIds = orgs.map((org) => org.id);
  if (orgIds.length > 0) {
    await prisma.publicResourceLocator.deleteMany({ where: { organizationId: { in: orgIds } } });
    await prisma.publicTokenLocator.deleteMany({ where: { organizationId: { in: orgIds } } });
  }
  for (const org of orgs) {
    await withOrg(org.id, async (tx) => {
      await tx.checkIn.deleteMany({ where: { notes: { contains: runTag } } });
      await tx.orderItem.deleteMany({ where: { order: { collectionCode: { startsWith: runTag } } } });
      await tx.order.deleteMany({ where: { collectionCode: { startsWith: runTag } } });
      await tx.ticket.deleteMany({ where: { code: { startsWith: runTag } } });
      await tx.seatReservation.deleteMany({ where: { guestEmail: { contains: runTag } } });
      await tx.seatZone.deleteMany({ where: { name: { startsWith: runTag } } });
      await tx.venueSection.deleteMany({ where: { name: { startsWith: runTag } } });
      await tx.game.deleteMany({ where: { fixture: { id: { startsWith: runTag } } } });
      await tx.fixture.deleteMany({ where: { id: { startsWith: runTag } } });
      await tx.event.deleteMany({ where: { name: { startsWith: runTag } } });
      await tx.mediaAssetVariant.deleteMany({ where: { asset: { title: { startsWith: runTag } } } });
      await tx.mediaAssetUsage.deleteMany({ where: { asset: { title: { startsWith: runTag } } } });
      await tx.mediaAsset.deleteMany({ where: { title: { startsWith: runTag } } });
      await tx.standing.deleteMany({ where: { seasonClub: { club: { name: { startsWith: runTag } } } } });
      await tx.seasonClub!.deleteMany({ where: { club: { name: { startsWith: runTag } } } });
      await tx.player.deleteMany({ where: { athlete: { email: { contains: runTag } } } });
      await tx.athlete.deleteMany({ where: { email: { contains: runTag } } });
      await tx.club.deleteMany({ where: { name: { startsWith: runTag } } });
      await tx.venue.deleteMany({ where: { name: { startsWith: runTag } } });
      await tx.season.deleteMany({ where: { name: { startsWith: runTag } } });
      await tx.division.deleteMany({ where: { slug: { startsWith: runTag } } });
      await tx.competition.deleteMany({ where: { slug: { startsWith: runTag } } });
      await tx.userRoleAssignment.deleteMany({ where: { user: { email: { contains: runTag } } } });
    });
  }
  await prisma.user.deleteMany({ where: { email: { contains: runTag } } });
  await prisma.organization.deleteMany({ where: { slug: { startsWith: runTag } } });
}

async function httpStatus(pathname: string) {
  const response = await fetch(`${baseUrl}${pathname}`, { redirect: "manual" });
  return response.status;
}

async function main() {
  await cleanup();

  const target = await prisma.$queryRaw<Array<{ db: string; usr: string }>>`select current_database() as db, current_user as usr`;
  record("TARGET_DATABASE", "INFO", target[0]);

  const role = await prisma.$queryRaw<Array<{ rolsuper: boolean; rolbypassrls: boolean }>>`select rolsuper, rolbypassrls from pg_roles where rolname = current_user`;
  assertCheck("RUNTIME_ROLE_RESTRICTED", role[0] && !role[0].rolsuper && !role[0].rolbypassrls, role[0]);

  const sport = await prisma.sport.findFirst({ where: { slug: "basketball" } });
  if (!sport) throw new Error("basketball sport not found");

  const org = await prisma.organization.create({
    data: {
      name: `${runTag} Organization`,
      slug: runTag,
      idPrefixAthlete: `A${Date.now().toString().slice(-5)}`,
      idPrefixStaff: `S${Date.now().toString().slice(-5)}`,
    },
  });
  const user = await prisma.user.create({
    data: { name: `${runTag} Operator`, email: `${runTag}@example.test`, role: "SUPER_ADMIN" },
  });
  await withOrg(org.id, async (tx) => {
    await tx.userRoleAssignment.create({
      data: { organizationId: org.id, userId: user.id, role: "SUPER_ADMIN", grantedById: user.id },
    });
  });

  const created = await withOrg(org.id, async (tx) => {
    const competition = await tx.competition.create({
      data: { organizationId: org.id, sportId: sport.id, name: `${runTag} Competition`, slug: runTag },
    });
    const division = await tx.division.create({
      data: { organizationId: org.id, competitionId: competition.id, name: `${runTag} Division`, slug: runTag },
    });
    const season = await tx.season.create({
      data: {
        organizationId: org.id,
        competitionId: competition.id,
        name: `${runTag} Season`,
        startDate: new Date("2026-01-01T00:00:00.000Z"),
        endDate: new Date("2026-12-31T00:00:00.000Z"),
        status: "ACTIVE",
      },
    });
    const venue = await tx.venue.create({
      data: { organizationId: org.id, name: `${runTag} Venue`, address: "Staging", city: "Lagos", capacity: 120 },
    });
    const homeClub = await tx.club.create({
      data: { organizationId: org.id, sportId: sport.id, name: `${runTag} Home Club`, shortName: `${runTag.slice(-8)}H`, status: "ACTIVE" },
    });
    await upsertPublicResourceLocator(tx, { resourceType: PublicResourceLocatorType.CLUB, publicKey: homeClub.id, organizationId: org.id, resourceId: homeClub.id });
    const awayClub = await tx.club.create({
      data: { organizationId: org.id, sportId: sport.id, name: `${runTag} Away Club`, shortName: `${runTag.slice(-8)}A`, status: "ACTIVE" },
    });
    await upsertPublicResourceLocator(tx, { resourceType: PublicResourceLocatorType.CLUB, publicKey: awayClub.id, organizationId: org.id, resourceId: awayClub.id });
    const homeSeasonClub = await tx.seasonClub!.create({
      data: { organizationId: org.id, seasonId: season.id, clubId: homeClub.id, divisionId: division.id, status: "ACTIVE" },
    });
    const awaySeasonClub = await tx.seasonClub!.create({
      data: { organizationId: org.id, seasonId: season.id, clubId: awayClub.id, divisionId: division.id, status: "ACTIVE" },
    });
    await tx.standing.createMany({
      data: [
        { organizationId: org.id, seasonId: season.id, seasonClubId: homeSeasonClub.id },
        { organizationId: org.id, seasonId: season.id, seasonClubId: awaySeasonClub.id },
      ],
    });
    const athlete = await tx.athlete.create({
      data: {
        organizationId: org.id,
        firstName: runTag,
        lastName: "Athlete",
        gender: "MALE",
        dateOfBirth: new Date("2000-01-01T00:00:00.000Z"),
        dominantHand: "RIGHT",
        email: `${runTag}-athlete@example.test`,
      },
    });
    await upsertPublicResourceLocator(tx, { resourceType: PublicResourceLocatorType.ATHLETE, publicKey: athlete.id, organizationId: org.id, resourceId: athlete.id });
    await tx.player.create({
      data: { organizationId: org.id, athleteId: athlete.id, seasonId: season.id, seasonClubId: homeSeasonClub.id, position: "POINT_GUARD", heightCm: 183, weightKg: 80 },
    });
    const event = await tx.event.create({
      data: {
        organizationId: org.id,
        name: `${runTag} Event`,
        seasonId: season.id,
        venueId: venue.id,
        date: new Date("2026-10-01T18:00:00.000Z"),
        startTime: new Date("2026-10-01T18:00:00.000Z"),
        status: "PUBLISHED",
      },
    });
    await upsertPublicResourceLocator(tx, { resourceType: PublicResourceLocatorType.EVENT, publicKey: event.id, organizationId: org.id, resourceId: event.id });
    const fixture = await tx.fixture.create({
      data: {
        id: `${runTag}-fixture`,
        organizationId: org.id,
        seasonId: season.id,
        divisionId: division.id,
        eventId: event.id,
        homeSeasonClubId: homeSeasonClub.id,
        awaySeasonClubId: awaySeasonClub.id,
        scheduledAt: new Date("2026-10-01T18:00:00.000Z"),
        venueId: venue.id,
        status: "SCHEDULED",
        recordOrigin: RecordOrigin.REHEARSAL,
      },
    });
    await upsertPublicResourceLocator(tx, { resourceType: PublicResourceLocatorType.FIXTURE, publicKey: fixture.id, organizationId: org.id, resourceId: fixture.id });
    await tx.game.create({ data: { organizationId: org.id, fixtureId: fixture.id, status: "NOT_STARTED" } });
    const section = await tx.venueSection.create({
      data: { organizationId: org.id, venueId: venue.id, name: `${runTag} Section`, code: runTag.slice(-10).toUpperCase(), capacity: 40 },
    });
    const zone = await tx.seatZone.create({
      data: { organizationId: org.id, eventId: event.id, venueSectionId: section.id, name: `${runTag} Zone`, capacity: 20, priceKobo: 0, isActive: true },
    });
    const reservation = await tx.seatReservation.create({
      data: {
        organizationId: org.id,
        eventId: event.id,
        seatZoneId: zone.id,
        guestName: `${runTag} Guest`,
        guestEmail: `${runTag}-guest@example.test`,
        guestPhone: "08000000000",
        quantity: 1,
        unitPriceKobo: 0,
        totalKobo: 0,
        paymentStatus: "PAID",
      },
    });
    const ticket = await tx.ticket.create({
      data: { organizationId: org.id, reservationId: reservation.id, code: `${runTag}-ticket`, status: "ACTIVE" },
    });
    await upsertPublicTokenLocator(tx, { tokenType: PublicTokenLocatorType.TICKET, rawToken: ticket.code, organizationId: org.id, resourceId: ticket.id });
    const order = await tx.order.create({
      data: {
        organizationId: org.id,
        eventId: event.id,
        reservationId: reservation.id,
        guestName: reservation.guestName,
        guestEmail: reservation.guestEmail,
        guestPhone: reservation.guestPhone,
        subtotalKobo: 0,
        discountKobo: 0,
        totalKobo: 0,
        paymentStatus: "PAID",
        status: "READY",
        collectionCode: `${runTag}-order`,
      },
    });
    await upsertPublicTokenLocator(tx, { tokenType: PublicTokenLocatorType.ORDER, rawToken: order.collectionCode, organizationId: org.id, resourceId: order.id });
    const objectKey = `stage55a/${runTag}.txt`;
    await mkdir(path.dirname(path.join(mediaRoot(), objectKey)), { recursive: true });
    await writeFile(path.join(mediaRoot(), objectKey), `stage55a ${runTag}`);
    const mediaPublic = await tx.mediaAsset.create({
      data: {
        organizationId: org.id,
        uploadedById: user.id,
        purpose: MediaAssetPurpose.CONTENT_ASSET,
        storageProvider: MediaStorageProvider.LOCAL_PERSISTENT_STORAGE,
        objectKey,
        originalFilename: `${runTag}.txt`,
        mimeType: "text/plain",
        byteSize: Buffer.byteLength(`stage55a ${runTag}`),
        checksumSha256: createHash("sha256").update(`stage55a ${runTag}`).digest("hex"),
        status: MediaAssetStatus.READY,
        visibility: MediaVisibility.PUBLIC,
        title: `${runTag} Public Media`,
      },
    });
    await upsertPublicResourceLocator(tx, { resourceType: PublicResourceLocatorType.MEDIA_ASSET, publicKey: mediaPublic.id, organizationId: org.id, resourceId: mediaPublic.id });
    const privateObjectKey = `stage55a/${runTag}-private.txt`;
    await writeFile(path.join(mediaRoot(), privateObjectKey), `stage55a private ${runTag}`);
    const mediaPrivate = await tx.mediaAsset.create({
      data: {
        organizationId: org.id,
        uploadedById: user.id,
        purpose: MediaAssetPurpose.CONTENT_ASSET,
        storageProvider: MediaStorageProvider.LOCAL_PERSISTENT_STORAGE,
        objectKey: privateObjectKey,
        originalFilename: `${runTag}-private.txt`,
        mimeType: "text/plain",
        byteSize: Buffer.byteLength(`stage55a private ${runTag}`),
        checksumSha256: createHash("sha256").update(`stage55a private ${runTag}`).digest("hex"),
        status: MediaAssetStatus.READY,
        visibility: MediaVisibility.PRIVATE,
        title: `${runTag} Private Media`,
      },
    });
    await upsertPublicResourceLocator(tx, { resourceType: PublicResourceLocatorType.MEDIA_ASSET, publicKey: mediaPrivate.id, organizationId: org.id, resourceId: mediaPrivate.id });
    return { competition, division, season, venue, homeClub, awayClub, homeSeasonClub, awaySeasonClub, athlete, event, fixture, ticket, order, mediaPublic, mediaPrivate };
  });

  const clubLocator = await resolvePublicResourceLocator(prisma, PublicResourceLocatorType.CLUB, created.homeClub.id);
  assertCheck("NO_CONTEXT_RESOURCE_LOCATOR_BOOTSTRAP", clubLocator?.organizationId === org.id && clubLocator.resourceId === created.homeClub.id, clubLocator);
  const ticketLocator = await resolvePublicTokenLocator(prisma, PublicTokenLocatorType.TICKET, created.ticket.code);
  assertCheck("NO_CONTEXT_TOKEN_LOCATOR_BOOTSTRAP", ticketLocator?.organizationId === org.id && ticketLocator.resourceId === created.ticket.id, ticketLocator ? { organizationId: ticketLocator.organizationId, resourceId: ticketLocator.resourceId } : null);

  const rereadClub = clubLocator ? await withOrg(clubLocator.organizationId, (tx) => tx.club.findUnique({ where: { id: clubLocator.resourceId }, select: { id: true, organizationId: true } })) : null;
  assertCheck("AUTHORITATIVE_REREAD_RESOURCE", Boolean(clubLocator && locatorMatchesResource(clubLocator, rereadClub)), rereadClub);
  const rereadTicket = ticketLocator ? await withOrg(ticketLocator.organizationId, (tx) => tx.ticket.findUnique({ where: { id: ticketLocator.resourceId }, select: { id: true, organizationId: true, code: true } })) : null;
  assertCheck("AUTHORITATIVE_REREAD_TOKEN", Boolean(ticketLocator && locatorMatchesResource(ticketLocator, rereadTicket) && rereadTicket?.code === created.ticket.code), rereadTicket ? { id: rereadTicket.id, organizationId: rereadTicket.organizationId, codeMatched: rereadTicket.code === created.ticket.code } : null);

  assertCheck("UNKNOWN_PUBLIC_KEY_FAILS_CLOSED", !(await resolvePublicResourceLocator(prisma, PublicResourceLocatorType.CLUB, `${runTag}-missing`)));
  assertCheck("ALTERED_TOKEN_FAILS_CLOSED", !(await resolvePublicTokenLocator(prisma, PublicTokenLocatorType.TICKET, `${created.ticket.code}x`)));
  assertCheck("WRONG_TOKEN_TYPE_FAILS_CLOSED", !(await resolvePublicTokenLocator(prisma, PublicTokenLocatorType.ORDER, created.ticket.code)));
  assertCheck("TOKEN_TYPE_ISOLATION", hashPublicToken(PublicTokenLocatorType.TICKET, "same") !== hashPublicToken(PublicTokenLocatorType.ORDER, "same"));

  const inactive = await prisma.publicResourceLocator.create({
    data: { resourceType: PublicResourceLocatorType.CLUB, publicKey: `${runTag}-inactive`, organizationId: org.id, resourceId: created.homeClub.id, status: PublicLocatorStatus.INACTIVE },
  });
  assertCheck("INACTIVE_LOCATOR_FAILS_CLOSED", !(await resolvePublicResourceLocator(prisma, PublicResourceLocatorType.CLUB, inactive.publicKey)));

  const tampered = await prisma.publicResourceLocator.create({
    data: { resourceType: PublicResourceLocatorType.CLUB, publicKey: `${runTag}-tampered`, organizationId: org.id, resourceId: created.awayClub.id, status: PublicLocatorStatus.ACTIVE },
  });
  const tamperedReread = await withOrg(org.id, (tx) => tx.club.findUnique({ where: { id: tampered.resourceId }, select: { id: true, organizationId: true } }));
  assertCheck("LOCATOR_IS_NOT_AUTHORIZATION", !locatorMatchesResource({ organizationId: org.id, resourceId: created.homeClub.id }, tamperedReread), tamperedReread);

  const duplicateRollbackKey = `${runTag}-rollback`;
  try {
    await withOrg(org.id, async (tx) => {
      await upsertPublicResourceLocator(tx, { resourceType: PublicResourceLocatorType.CLUB, publicKey: duplicateRollbackKey, organizationId: org.id, resourceId: created.homeClub.id });
      throw new Error("CONTROLLED_ROLLBACK");
    });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "CONTROLLED_ROLLBACK") throw error;
  }
  assertCheck("ATOMIC_ROLLBACK_RESOURCE_LOCATOR", !(await prisma.publicResourceLocator.findUnique({ where: { resourceType_publicKey: { resourceType: PublicResourceLocatorType.CLUB, publicKey: duplicateRollbackKey } } })));

  const [orgAClub, orgBClub] = await Promise.all([
    withOrg("cmt4odhgn0000wokk8fbwr6ro", (tx) => tx.club.findFirst({ select: { organizationId: true } })),
    withOrg(org.id, (tx) => tx.club.findFirst({ where: { id: created.homeClub.id }, select: { organizationId: true } })),
  ]);
  assertCheck("CONCURRENT_CONTEXT_NO_BLEED", orgAClub?.organizationId === "cmt4odhgn0000wokk8fbwr6ro" && orgBClub?.organizationId === org.id, { orgA: orgAClub, orgB: orgBClub });

  const tokenHashRows = await prisma.publicTokenLocator.findMany({ where: { resourceId: { in: [created.ticket.id, created.order.id] } }, select: { tokenType: true, tokenHash: true } });
  assertCheck("RAW_BEARER_TOKEN_NOT_STORED_IN_LOCATOR", tokenHashRows.every((row) => row.tokenHash !== created.ticket.code && row.tokenHash !== created.order.collectionCode), { rows: tokenHashRows.length });

  const httpChecks: Array<[string, number[], string?]> = [
    [`/public/clubs/${created.homeClub.id}`, [200]],
    [`/public/events/${created.event.id}`, [200]],
    [`/public/fixtures/${created.fixture.id}`, [200]],
    [`/public/tickets/${created.ticket.code}`, [200]],
    [`/public/orders/${created.order.collectionCode}`, [200]],
    [`/media/assets/${created.mediaPublic.id}/file`, [200]],
    [`/media/assets/${created.mediaPrivate.id}/file`, [401]],
    [`/public/clubs/${runTag}-missing`, [404]],
    [`/public/share/team/${created.homeClub.id}`, [404], "Share team card requires finalized team totals; minimal Org B fixture should fail closed."],
    [`/public/share/player/${created.athlete.id}`, [404], "Share player card requires player season totals; minimal Org B fixture should fail closed."],
    [`/public/share/game/${created.fixture.id}`, [404], "Share game card requires FINAL game analytics; minimal Org B fixture should fail closed."],
  ];
  await Promise.all(httpChecks.map(async ([pathname, expected, note]) => {
    const status = await httpStatus(pathname);
    assertCheck(`HTTP ${pathname}`, expected.includes(status), { status, expected, note });
  }));

  const residueBeforeCleanup = await prisma.publicResourceLocator.count({ where: { publicKey: { startsWith: runTag } } });
  record("STAGE55A_RESIDUE_BEFORE_CLEANUP", "INFO", { resourceLocatorsWithRunTag: residueBeforeCleanup });
  await cleanup();
  const residue = {
    organizations: await prisma.organization.count({ where: { slug: { startsWith: runTag } } }),
    clubs: await prisma.club.count({ where: { name: { startsWith: runTag } } }),
    athletes: await prisma.athlete.count({ where: { email: { contains: runTag } } }),
    fixtures: await prisma.fixture.count({ where: { id: { startsWith: runTag } } }),
    events: await prisma.event.count({ where: { name: { startsWith: runTag } } }),
    mediaAssets: await prisma.mediaAsset.count({ where: { title: { startsWith: runTag } } }),
    resourceLocators: await prisma.publicResourceLocator.count({ where: { publicKey: { startsWith: runTag } } }),
    tokenLocators: await prisma.publicTokenLocator.count({ where: { resourceId: { startsWith: runTag } } }),
  };
  assertCheck("STAGING_CLEANUP_RESIDUE_ZERO", Object.values(residue).every((count) => count === 0), residue);

  const summary = {
    runTag,
    baseUrl,
    checks,
    failed: checks.filter((check) => check.status === "FAIL").length,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (summary.failed > 0) process.exit(1);
}

main()
  .catch(async (error) => {
    record("SCRIPT_ERROR", "FAIL", error instanceof Error ? error.message : String(error));
    try {
      await cleanup();
    } catch (cleanupError) {
      record("SCRIPT_CLEANUP_ERROR", "FAIL", cleanupError instanceof Error ? cleanupError.message : String(cleanupError));
    }
    console.error(JSON.stringify({ runTag, checks, failed: checks.filter((check) => check.status === "FAIL").length }, null, 2));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
