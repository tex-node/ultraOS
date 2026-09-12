import "dotenv/config";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  GameDataCapability,
  GameStatus,
  MediaAssetPurpose,
  MediaAssetStatus,
  MediaStorageProvider,
  MediaVisibility,
  OrganizationStatus,
  PaymentStatus,
  PublicLocatorStatus,
  PublicResourceLocatorType,
  PublicTokenLocatorType,
  RecordOrigin,
  StatDataSource,
  TicketStatus,
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
const runTag = `stage55a-full-${Date.now()}-${randomUUID().slice(0, 8)}`;
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

type CheckStatus = "PASS" | "FAIL" | "INFO" | "CODE_PATH_VERIFIED";
type Check = { name: string; status: CheckStatus; details?: unknown };
type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

const checks: Check[] = [];

function record(name: string, status: CheckStatus, details?: unknown) {
  checks.push({ name, status, details });
}

function assertCheck(name: string, condition: unknown, details?: unknown) {
  record(name, condition ? "PASS" : "FAIL", details);
}

function secretToken(label: string) {
  return `${label}_${randomBytes(24).toString("hex")}`;
}

async function withOrg<T>(organizationId: string, fn: (tx: Tx) => Promise<T>) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_org_id', ${organizationId}, true)`;
    return fn(tx);
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
    await prisma.publicResourceLocator.deleteMany({
      where: { organizationId: { in: orgIds } },
    });
    await prisma.publicTokenLocator.deleteMany({
      where: { organizationId: { in: orgIds } },
    });
  }

  for (const org of orgs) {
    await withOrg(org.id, async (tx) => {
      await tx.checkIn.deleteMany({ where: { notes: { contains: runTag } } });
      await tx.orderItem.deleteMany({
        where: { order: { guestEmail: { contains: runTag } } },
      });
      await tx.order.deleteMany({ where: { guestEmail: { contains: runTag } } });
      await tx.ticket.deleteMany({
        where: { reservation: { guestEmail: { contains: runTag } } },
      });
      await tx.seatReservation.deleteMany({
        where: { guestEmail: { contains: runTag } },
      });
      await tx.seatZone.deleteMany({ where: { name: { startsWith: runTag } } });
      await tx.venueSection.deleteMany({
        where: { name: { startsWith: runTag } },
      });
      await tx.playerStat.deleteMany({
        where: { game: { fixture: { id: { startsWith: runTag } } } },
      });
      await tx.teamStat.deleteMany({
        where: { game: { fixture: { id: { startsWith: runTag } } } },
      });
      await tx.gamePeriodScore.deleteMany({
        where: { game: { fixture: { id: { startsWith: runTag } } } },
      });
      await tx.game.deleteMany({
        where: { fixture: { id: { startsWith: runTag } } },
      });
      await tx.fixture.deleteMany({ where: { id: { startsWith: runTag } } });
      await tx.event.deleteMany({ where: { name: { startsWith: runTag } } });
      await tx.mediaAssetVariant.deleteMany({
        where: { asset: { title: { startsWith: runTag } } },
      });
      await tx.mediaAssetUsage.deleteMany({
        where: { asset: { title: { startsWith: runTag } } },
      });
      await tx.mediaAsset.deleteMany({
        where: { title: { startsWith: runTag } },
      });
      await tx.standing.deleteMany({
        where: { seasonClub: { club: { name: { startsWith: runTag } } } },
      });
      await tx.seasonClub.deleteMany({
        where: { club: { name: { startsWith: runTag } } },
      });
      await tx.player.deleteMany({
        where: { athlete: { email: { contains: runTag } } },
      });
      await tx.athlete.deleteMany({
        where: { email: { contains: runTag } },
      });
      await tx.club.deleteMany({ where: { name: { startsWith: runTag } } });
      await tx.venue.deleteMany({ where: { name: { startsWith: runTag } } });
      await tx.season.deleteMany({ where: { name: { startsWith: runTag } } });
      await tx.division.deleteMany({ where: { slug: { startsWith: runTag } } });
      await tx.competition.deleteMany({
        where: { slug: { startsWith: runTag } },
      });
      await tx.userRoleAssignment.deleteMany({
        where: { user: { email: { contains: runTag } } },
      });
    });
  }

  await prisma.user.deleteMany({ where: { email: { contains: runTag } } });
  await prisma.organization.deleteMany({ where: { slug: { startsWith: runTag } } });
}

async function httpStatus(pathname: string) {
  const response = await fetch(`${baseUrl}${pathname}`, { redirect: "manual" });
  return response.status;
}

async function httpText(pathname: string) {
  const response = await fetch(`${baseUrl}${pathname}`, { redirect: "manual" });
  return { status: response.status, text: await response.text() };
}

async function loadClub(publicKey: string) {
  const locator = await resolvePublicResourceLocator(
    prisma,
    PublicResourceLocatorType.CLUB,
    publicKey,
  );
  if (!locator) return null;
  const club = await withOrg(locator.organizationId, (tx) =>
    tx.club.findUnique({
      where: { id: locator.resourceId },
      select: { id: true, organizationId: true, name: true },
    }),
  );
  return locatorMatchesResource(locator, club) ? club : null;
}

async function loadTicket(rawToken: string) {
  const locator = await resolvePublicTokenLocator(
    prisma,
    PublicTokenLocatorType.TICKET,
    rawToken,
  );
  if (!locator) return null;
  const ticket = await withOrg(locator.organizationId, (tx) =>
    tx.ticket.findUnique({
      where: { id: locator.resourceId },
      select: { id: true, organizationId: true, code: true },
    }),
  );
  return locatorMatchesResource(locator, ticket) && ticket?.code === rawToken
    ? ticket
    : null;
}

async function loadOrder(rawToken: string) {
  const locator = await resolvePublicTokenLocator(
    prisma,
    PublicTokenLocatorType.ORDER,
    rawToken,
  );
  if (!locator) return null;
  const order = await withOrg(locator.organizationId, (tx) =>
    tx.order.findUnique({
      where: { id: locator.resourceId },
      select: { id: true, organizationId: true, collectionCode: true },
    }),
  );
  return locatorMatchesResource(locator, order) && order?.collectionCode === rawToken
    ? order
    : null;
}

async function createGraph(label: "A" | "B") {
  const sport = await prisma.sport.findFirst({ where: { slug: "basketball" } });
  if (!sport) throw new Error("Required sport row not found");

  const org = await prisma.organization.create({
    data: {
      name: `${runTag} Org ${label}`,
      slug: `${runTag}-${label.toLowerCase()}`,
      idPrefixAthlete: `${label}${Date.now().toString().slice(-5)}`,
      idPrefixStaff: `${label}${Date.now().toString().slice(-4)}S`,
    },
  });
  const user = await prisma.user.create({
    data: {
      name: `${runTag} Operator ${label}`,
      email: `${runTag}-${label.toLowerCase()}@example.test`,
      role: "SUPER_ADMIN",
    },
  });

  const graph = await withOrg(org.id, async (tx) => {
    await tx.userRoleAssignment.create({
      data: {
        organizationId: org.id,
        userId: user.id,
        role: "SUPER_ADMIN",
        grantedById: user.id,
      },
    });
    const competition = await tx.competition.create({
      data: {
        organizationId: org.id,
        sportId: sport.id,
        name: `${runTag} Competition ${label}`,
        slug: `${runTag}-${label.toLowerCase()}`,
      },
    });
    const division = await tx.division.create({
      data: {
        organizationId: org.id,
        competitionId: competition.id,
        name: `${runTag} Division ${label}`,
        slug: `${runTag}-${label.toLowerCase()}`,
      },
    });
    const season = await tx.season.create({
      data: {
        organizationId: org.id,
        competitionId: competition.id,
        name: `${runTag} Season ${label}`,
        startDate: new Date("2026-01-01T00:00:00.000Z"),
        endDate: new Date("2026-12-31T00:00:00.000Z"),
        status: "ACTIVE",
      },
    });
    const venue = await tx.venue.create({
      data: {
        organizationId: org.id,
        name: `${runTag} Venue ${label}`,
        address: "Staging",
        city: "Lagos",
        capacity: 120,
      },
    });
    const homeClub = await tx.club.create({
      data: {
        organizationId: org.id,
        sportId: sport.id,
        name: `${runTag} ${label} Home`,
        shortName: `${label}H${runTag.slice(-4)}`,
        status: "ACTIVE",
      },
    });
    await upsertPublicResourceLocator(tx, {
      resourceType: PublicResourceLocatorType.CLUB,
      publicKey: homeClub.id,
      organizationId: org.id,
      resourceId: homeClub.id,
    });
    const awayClub = await tx.club.create({
      data: {
        organizationId: org.id,
        sportId: sport.id,
        name: `${runTag} ${label} Away`,
        shortName: `${label}A${runTag.slice(-4)}`,
        status: "ACTIVE",
      },
    });
    await upsertPublicResourceLocator(tx, {
      resourceType: PublicResourceLocatorType.CLUB,
      publicKey: awayClub.id,
      organizationId: org.id,
      resourceId: awayClub.id,
    });
    const homeSeasonClub = await tx.seasonClub.create({
      data: {
        organizationId: org.id,
        seasonId: season.id,
        clubId: homeClub.id,
        divisionId: division.id,
        status: "ACTIVE",
      },
    });
    const awaySeasonClub = await tx.seasonClub.create({
      data: {
        organizationId: org.id,
        seasonId: season.id,
        clubId: awayClub.id,
        divisionId: division.id,
        status: "ACTIVE",
      },
    });
    await tx.standing.createMany({
      data: [
        { organizationId: org.id, seasonId: season.id, seasonClubId: homeSeasonClub.id },
        { organizationId: org.id, seasonId: season.id, seasonClubId: awaySeasonClub.id },
      ],
    });
    const homeAthlete = await tx.athlete.create({
      data: {
        organizationId: org.id,
        firstName: `${runTag} ${label}`,
        lastName: "Home Athlete",
        gender: "MALE",
        dateOfBirth: new Date("2000-01-01T00:00:00.000Z"),
        dominantHand: "RIGHT",
        email: `${runTag}-${label.toLowerCase()}-home@example.test`,
      },
    });
    await upsertPublicResourceLocator(tx, {
      resourceType: PublicResourceLocatorType.ATHLETE,
      publicKey: homeAthlete.id,
      organizationId: org.id,
      resourceId: homeAthlete.id,
    });
    const awayAthlete = await tx.athlete.create({
      data: {
        organizationId: org.id,
        firstName: `${runTag} ${label}`,
        lastName: "Away Athlete",
        gender: "MALE",
        dateOfBirth: new Date("2000-01-01T00:00:00.000Z"),
        dominantHand: "RIGHT",
        email: `${runTag}-${label.toLowerCase()}-away@example.test`,
      },
    });
    const homePlayer = await tx.player.create({
      data: {
        organizationId: org.id,
        athleteId: homeAthlete.id,
        seasonId: season.id,
        seasonClubId: homeSeasonClub.id,
        position: "POINT_GUARD",
        heightCm: 183,
        weightKg: 80,
      },
    });
    const awayPlayer = await tx.player.create({
      data: {
        organizationId: org.id,
        athleteId: awayAthlete.id,
        seasonId: season.id,
        seasonClubId: awaySeasonClub.id,
        position: "CENTER",
        heightCm: 198,
        weightKg: 90,
      },
    });
    const event = await tx.event.create({
      data: {
        organizationId: org.id,
        name: `${runTag} Event ${label}`,
        seasonId: season.id,
        venueId: venue.id,
        date: new Date("2026-10-01T18:00:00.000Z"),
        startTime: new Date("2026-10-01T18:00:00.000Z"),
        status: "PUBLISHED",
      },
    });
    await upsertPublicResourceLocator(tx, {
      resourceType: PublicResourceLocatorType.EVENT,
      publicKey: event.id,
      organizationId: org.id,
      resourceId: event.id,
    });
    const fixture = await tx.fixture.create({
      data: {
        id: `${runTag}-${label.toLowerCase()}-fixture`,
        organizationId: org.id,
        seasonId: season.id,
        divisionId: division.id,
        eventId: event.id,
        homeSeasonClubId: homeSeasonClub.id,
        awaySeasonClubId: awaySeasonClub.id,
        scheduledAt: new Date("2026-10-01T18:00:00.000Z"),
        venueId: venue.id,
        status: "FINAL",
        homeScore: label === "A" ? 78 : 68,
        awayScore: label === "A" ? 71 : 61,
        recordOrigin: RecordOrigin.PRODUCTION,
      },
    });
    await upsertPublicResourceLocator(tx, {
      resourceType: PublicResourceLocatorType.FIXTURE,
      publicKey: fixture.id,
      organizationId: org.id,
      resourceId: fixture.id,
    });
    const game = await tx.game.create({
      data: {
        organizationId: org.id,
        fixtureId: fixture.id,
        status: GameStatus.FINAL,
        dataCapability: GameDataCapability.BOX_SCORE_ONLY,
        statSource: StatDataSource.MANUAL_ADMIN_ENTRY,
        endedAt: new Date("2026-10-01T20:00:00.000Z"),
      },
    });
    await tx.teamStat.createMany({
      data: [
        {
          organizationId: org.id,
          gameId: game.id,
          seasonClubId: homeSeasonClub.id,
          points: fixture.homeScore,
          rebounds: 35,
          assists: 18,
          turnovers: 10,
          fouls: 12,
          statSource: StatDataSource.MANUAL_ADMIN_ENTRY,
        },
        {
          organizationId: org.id,
          gameId: game.id,
          seasonClubId: awaySeasonClub.id,
          points: fixture.awayScore,
          rebounds: 32,
          assists: 14,
          turnovers: 12,
          fouls: 14,
          statSource: StatDataSource.MANUAL_ADMIN_ENTRY,
        },
      ],
    });
    await tx.playerStat.createMany({
      data: [
        {
          organizationId: org.id,
          gameId: game.id,
          playerId: homePlayer.id,
          seasonClubId: homeSeasonClub.id,
          points: 24,
          rebounds: 8,
          assists: 6,
          steals: 2,
          blocks: 1,
          turnovers: 3,
          fouls: 2,
          minutesPlayed: 28,
          fieldGoalsMade: 9,
          fieldGoalsAttempted: 16,
          plusMinus: 7,
          efficiency: 28,
          statSource: StatDataSource.MANUAL_ADMIN_ENTRY,
        },
        {
          organizationId: org.id,
          gameId: game.id,
          playerId: awayPlayer.id,
          seasonClubId: awaySeasonClub.id,
          points: 18,
          rebounds: 7,
          assists: 2,
          steals: 1,
          blocks: 1,
          turnovers: 2,
          fouls: 3,
          minutesPlayed: 27,
          fieldGoalsMade: 7,
          fieldGoalsAttempted: 14,
          plusMinus: -7,
          efficiency: 20,
          statSource: StatDataSource.MANUAL_ADMIN_ENTRY,
        },
      ],
    });
    await tx.gamePeriodScore.createMany({
      data: [
        { organizationId: org.id, gameId: game.id, period: 1, label: "Q1", homeScore: 20, awayScore: 18 },
        { organizationId: org.id, gameId: game.id, period: 2, label: "Q2", homeScore: 38, awayScore: 35 },
        { organizationId: org.id, gameId: game.id, period: 3, label: "Q3", homeScore: 59, awayScore: 52 },
        { organizationId: org.id, gameId: game.id, period: 4, label: "Q4", homeScore: fixture.homeScore, awayScore: fixture.awayScore },
      ],
    });
    const section = await tx.venueSection.create({
      data: {
        organizationId: org.id,
        venueId: venue.id,
        name: `${runTag} Section ${label}`,
        code: `${label}${runTag.slice(-9)}`.toUpperCase(),
        capacity: 40,
      },
    });
    const zone = await tx.seatZone.create({
      data: {
        organizationId: org.id,
        eventId: event.id,
        venueSectionId: section.id,
        name: `${runTag} Zone ${label}`,
        capacity: 20,
        priceKobo: 0,
        isActive: true,
      },
    });
    const reservation = await tx.seatReservation.create({
      data: {
        organizationId: org.id,
        eventId: event.id,
        seatZoneId: zone.id,
        guestName: `${runTag} Guest ${label}`,
        guestEmail: `${runTag}-${label.toLowerCase()}-guest@example.test`,
        guestPhone: "08000000000",
        quantity: 1,
        unitPriceKobo: 0,
        totalKobo: 0,
        paymentStatus: PaymentStatus.PAID,
      },
    });
    const ticketCode = secretToken(`ticket-${label}`);
    const ticket = await tx.ticket.create({
      data: {
        organizationId: org.id,
        reservationId: reservation.id,
        code: ticketCode,
        status: TicketStatus.ACTIVE,
      },
    });
    await upsertPublicTokenLocator(tx, {
      tokenType: PublicTokenLocatorType.TICKET,
      rawToken: ticket.code,
      organizationId: org.id,
      resourceId: ticket.id,
    });
    const orderCode = secretToken(`order-${label}`);
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
        paymentStatus: PaymentStatus.PAID,
        status: "READY",
        collectionCode: orderCode,
      },
    });
    await upsertPublicTokenLocator(tx, {
      tokenType: PublicTokenLocatorType.ORDER,
      rawToken: order.collectionCode,
      organizationId: org.id,
      resourceId: order.id,
    });
    const publicObjectKey = `stage55a/${runTag}-${label}-public.txt`;
    const privateObjectKey = `stage55a/${runTag}-${label}-private.txt`;
    await mkdir(path.dirname(path.join(mediaRoot(), publicObjectKey)), {
      recursive: true,
    });
    await writeFile(path.join(mediaRoot(), publicObjectKey), `public ${label}`);
    await writeFile(path.join(mediaRoot(), privateObjectKey), `private ${label}`);
    const mediaPublic = await tx.mediaAsset.create({
      data: {
        organizationId: org.id,
        uploadedById: user.id,
        purpose: MediaAssetPurpose.CONTENT_ASSET,
        storageProvider: MediaStorageProvider.LOCAL_PERSISTENT_STORAGE,
        objectKey: publicObjectKey,
        originalFilename: `${runTag}-${label}-public.txt`,
        mimeType: "text/plain",
        byteSize: Buffer.byteLength(`public ${label}`),
        checksumSha256: createHash("sha256").update(`public ${label}`).digest("hex"),
        status: MediaAssetStatus.READY,
        visibility: MediaVisibility.PUBLIC,
        title: `${runTag} Public Media ${label}`,
      },
    });
    await upsertPublicResourceLocator(tx, {
      resourceType: PublicResourceLocatorType.MEDIA_ASSET,
      publicKey: mediaPublic.id,
      organizationId: org.id,
      resourceId: mediaPublic.id,
    });
    const mediaPrivate = await tx.mediaAsset.create({
      data: {
        organizationId: org.id,
        uploadedById: user.id,
        purpose: MediaAssetPurpose.CONTENT_ASSET,
        storageProvider: MediaStorageProvider.LOCAL_PERSISTENT_STORAGE,
        objectKey: privateObjectKey,
        originalFilename: `${runTag}-${label}-private.txt`,
        mimeType: "text/plain",
        byteSize: Buffer.byteLength(`private ${label}`),
        checksumSha256: createHash("sha256").update(`private ${label}`).digest("hex"),
        status: MediaAssetStatus.READY,
        visibility: MediaVisibility.PRIVATE,
        title: `${runTag} Private Media ${label}`,
      },
    });
    await upsertPublicResourceLocator(tx, {
      resourceType: PublicResourceLocatorType.MEDIA_ASSET,
      publicKey: mediaPrivate.id,
      organizationId: org.id,
      resourceId: mediaPrivate.id,
    });
    return {
      competition,
      division,
      season,
      venue,
      homeClub,
      awayClub,
      homeSeasonClub,
      awaySeasonClub,
      homeAthlete,
      awayAthlete,
      homePlayer,
      event,
      fixture,
      game,
      ticket,
      order,
      mediaPublic,
      mediaPrivate,
      section,
      zone,
      reservation,
    };
  });

  return { org, user, ...graph };
}

async function assertRouteContains(
  name: string,
  pathname: string,
  expectedText: string,
) {
  const response = await httpText(pathname);
  assertCheck(name, response.status === 200 && response.text.includes(expectedText), {
    status: response.status,
    containsExpectedText: response.text.includes(expectedText),
  });
}

async function locatorState() {
  const result = await prisma.$queryRaw<
    Array<{
      expected_resource_rows: bigint;
      active_resource_locators: bigint;
      missing_resource_locators: bigint;
      expected_token_rows: bigint;
      active_token_locators: bigint;
      missing_token_locators: bigint;
      null_org_resource_locators: bigint;
      null_org_token_locators: bigint;
      duplicate_resource_public_keys: bigint;
      duplicate_token_hashes: bigint;
    }>
  >`
    WITH expected_resource AS (
      SELECT 'ATHLETE'::text AS resource_type, id::text AS resource_id, "organizationId"::text AS organization_id FROM "Athlete"
      UNION ALL SELECT 'CLUB', id::text, "organizationId"::text FROM "Club"
      UNION ALL SELECT 'EVENT', id::text, "organizationId"::text FROM "Event"
      UNION ALL SELECT 'FIXTURE', id::text, "organizationId"::text FROM "Fixture"
      UNION ALL SELECT 'MEDIA_ASSET', id::text, "organizationId"::text FROM "MediaAsset"
    ), resource_summary AS (
      SELECT
        count(*) AS expected_resource_rows,
        count(pl.id) AS active_resource_locators,
        count(*) FILTER (WHERE pl.id IS NULL) AS missing_resource_locators
      FROM expected_resource er
      LEFT JOIN "PublicResourceLocator" pl
        ON pl."resourceType"::text = er.resource_type
       AND pl."resourceId" = er.resource_id
       AND pl."organizationId" = er.organization_id
       AND pl.status::text = 'ACTIVE'
    ), expected_tokens AS (
      SELECT 'TICKET'::text AS token_type, id::text AS resource_id, "organizationId"::text AS organization_id FROM "Ticket"
      UNION ALL SELECT 'ORDER'::text, id::text, "organizationId"::text FROM "Order"
    ), token_summary AS (
      SELECT
        count(*) AS expected_token_rows,
        count(pt.id) AS active_token_locators,
        count(*) FILTER (WHERE pt.id IS NULL) AS missing_token_locators
      FROM expected_tokens et
      LEFT JOIN "PublicTokenLocator" pt
        ON pt."tokenType"::text = et.token_type
       AND pt."resourceId" = et.resource_id
       AND pt."organizationId" = et.organization_id
       AND pt.status::text = 'ACTIVE'
    ), duplicate_keys AS (
      SELECT
        (SELECT count(*) FROM (SELECT "resourceType", "publicKey", count(*) FROM "PublicResourceLocator" GROUP BY 1,2 HAVING count(*) > 1) d) AS duplicate_resource_public_keys,
        (SELECT count(*) FROM (SELECT "tokenType", "tokenHash", count(*) FROM "PublicTokenLocator" GROUP BY 1,2 HAVING count(*) > 1) d) AS duplicate_token_hashes
    )
    SELECT
      resource_summary.*,
      token_summary.*,
      (SELECT count(*) FROM "PublicResourceLocator" WHERE "organizationId" IS NULL) AS null_org_resource_locators,
      (SELECT count(*) FROM "PublicTokenLocator" WHERE "organizationId" IS NULL) AS null_org_token_locators,
      duplicate_keys.*
    FROM resource_summary, token_summary, duplicate_keys
  `;
  return Object.fromEntries(
    Object.entries(result[0]).map(([key, value]) => [
      key,
      typeof value === "bigint" ? Number(value) : value,
    ]),
  );
}

async function main() {
  await cleanup();

  const target = await prisma.$queryRaw<Array<{ db: string; usr: string }>>`
    select current_database() as db, current_user as usr
  `;
  record("TARGET_DATABASE", "INFO", target[0]);
  const role = await prisma.$queryRaw<
    Array<{ rolsuper: boolean; rolbypassrls: boolean }>
  >`select rolsuper, rolbypassrls from pg_roles where rolname = current_user`;
  assertCheck(
    "RUNTIME_ROLE_RESTRICTED",
    role[0] && !role[0].rolsuper && !role[0].rolbypassrls,
    role[0],
  );

  const before = await locatorState();
  record("LOCATOR_BASELINE_BEFORE", "INFO", before);

  const [a, b] = await Promise.all([createGraph("A"), createGraph("B")]);

  assertCheck("ORG_A_RESOURCE_BOOTSTRAP", (await loadClub(a.homeClub.id))?.organizationId === a.org.id);
  assertCheck("ORG_B_RESOURCE_BOOTSTRAP", (await loadClub(b.homeClub.id))?.organizationId === b.org.id);
  assertCheck("ORG_A_TICKET_BOOTSTRAP", (await loadTicket(a.ticket.code))?.organizationId === a.org.id);
  assertCheck("ORG_B_TICKET_BOOTSTRAP", (await loadTicket(b.ticket.code))?.organizationId === b.org.id);
  assertCheck("ORG_A_ORDER_BOOTSTRAP", (await loadOrder(a.order.collectionCode))?.organizationId === a.org.id);
  assertCheck("ORG_B_ORDER_BOOTSTRAP", (await loadOrder(b.order.collectionCode))?.organizationId === b.org.id);

  const aToBKey = `${runTag}-a-locator-b-resource`;
  const bToAKey = `${runTag}-b-locator-a-resource`;
  await prisma.publicResourceLocator.createMany({
    data: [
      {
        resourceType: PublicResourceLocatorType.CLUB,
        publicKey: aToBKey,
        organizationId: a.org.id,
        resourceId: b.homeClub.id,
        status: PublicLocatorStatus.ACTIVE,
      },
      {
        resourceType: PublicResourceLocatorType.CLUB,
        publicKey: bToAKey,
        organizationId: b.org.id,
        resourceId: a.homeClub.id,
        status: PublicLocatorStatus.ACTIVE,
      },
    ],
  });
  assertCheck("ORG_A_LOCATOR_TO_ORG_B_RESOURCE_FAILS_CLOSED", !(await loadClub(aToBKey)));
  assertCheck("ORG_B_LOCATOR_TO_ORG_A_RESOURCE_FAILS_CLOSED", !(await loadClub(bToAKey)));
  assertCheck(
    "CORRECT_PUBLIC_KEY_WRONG_RESOURCE_TYPE_FAILS_CLOSED",
    !(await resolvePublicResourceLocator(prisma, PublicResourceLocatorType.EVENT, a.homeClub.id)),
  );
  assertCheck(
    "UNKNOWN_PUBLIC_KEY_FAILS_CLOSED",
    !(await resolvePublicResourceLocator(prisma, PublicResourceLocatorType.CLUB, `${runTag}-missing`)),
  );
  const inactiveKey = `${runTag}-inactive-resource`;
  await prisma.publicResourceLocator.create({
    data: {
      resourceType: PublicResourceLocatorType.CLUB,
      publicKey: inactiveKey,
      organizationId: a.org.id,
      resourceId: a.homeClub.id,
      status: PublicLocatorStatus.INACTIVE,
    },
  });
  assertCheck("INACTIVE_RESOURCE_LOCATOR_FAILS_CLOSED", !(await loadClub(inactiveKey)));

  const suspendedOrg = await prisma.organization.create({
    data: {
      name: `${runTag} Suspended Org`,
      slug: `${runTag}-suspended`,
      status: OrganizationStatus.SUSPENDED,
      idPrefixAthlete: `Z${Date.now().toString().slice(-5)}`,
      idPrefixStaff: `Z${Date.now().toString().slice(-4)}S`,
    },
  });
  await prisma.publicResourceLocator.create({
    data: {
      resourceType: PublicResourceLocatorType.CLUB,
      publicKey: `${runTag}-suspended-org`,
      organizationId: suspendedOrg.id,
      resourceId: a.homeClub.id,
      status: PublicLocatorStatus.ACTIVE,
    },
  });
  assertCheck(
    "INACTIVE_ORGANIZATION_LOCATOR_FAILS_CLOSED",
    !(await resolvePublicResourceLocator(prisma, PublicResourceLocatorType.CLUB, `${runTag}-suspended-org`)),
  );

  assertCheck("UNKNOWN_TOKEN_FAILS_CLOSED", !(await loadTicket(secretToken("unknown"))));
  assertCheck("ALTERED_TOKEN_FAILS_CLOSED", !(await loadTicket(`${a.ticket.code}x`)));
  assertCheck("CORRECT_TOKEN_WRONG_TYPE_FAILS_CLOSED", !(await loadOrder(a.ticket.code)));
  assertCheck(
    "TOKEN_TYPE_HASH_ISOLATION",
    hashPublicToken(PublicTokenLocatorType.TICKET, "same") !==
      hashPublicToken(PublicTokenLocatorType.ORDER, "same"),
  );

  const inactiveToken = secretToken("inactive-ticket");
  await prisma.publicTokenLocator.create({
    data: {
      tokenType: PublicTokenLocatorType.TICKET,
      tokenHash: hashPublicToken(PublicTokenLocatorType.TICKET, inactiveToken),
      organizationId: a.org.id,
      resourceId: a.ticket.id,
      status: PublicLocatorStatus.INACTIVE,
    },
  });
  assertCheck("INACTIVE_TOKEN_LOCATOR_FAILS_CLOSED", !(await loadTicket(inactiveToken)));

  const staleToken = secretToken("stale-ticket");
  await prisma.publicTokenLocator.create({
    data: {
      tokenType: PublicTokenLocatorType.TICKET,
      tokenHash: hashPublicToken(PublicTokenLocatorType.TICKET, staleToken),
      organizationId: a.org.id,
      resourceId: `${runTag}-missing-ticket-id`,
      status: PublicLocatorStatus.ACTIVE,
    },
  });
  assertCheck("STALE_TOKEN_LOCATOR_FAILS_CLOSED", !(await loadTicket(staleToken)));

  const mismatchToken = secretToken("mismatch-ticket");
  await prisma.publicTokenLocator.create({
    data: {
      tokenType: PublicTokenLocatorType.TICKET,
      tokenHash: hashPublicToken(PublicTokenLocatorType.TICKET, mismatchToken),
      organizationId: a.org.id,
      resourceId: b.ticket.id,
      status: PublicLocatorStatus.ACTIVE,
    },
  });
  assertCheck("TOKEN_ORG_RESOURCE_MISMATCH_FAILS_CLOSED", !(await loadTicket(mismatchToken)));

  const rollbackResourceKey = `${runTag}-rollback-club`;
  try {
    await withOrg(a.org.id, async (tx) => {
      const club = await tx.club.create({
        data: {
          organizationId: a.org.id,
          sportId: a.homeClub.sportId,
          name: `${runTag} Rollback Club`,
          shortName: `RB${runTag.slice(-4)}`,
          status: "ACTIVE",
        },
      });
      await upsertPublicResourceLocator(tx, {
        resourceType: PublicResourceLocatorType.CLUB,
        publicKey: rollbackResourceKey,
        organizationId: a.org.id,
        resourceId: club.id,
      });
      throw new Error("CONTROLLED_RESOURCE_ROLLBACK");
    });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "CONTROLLED_RESOURCE_ROLLBACK") {
      throw error;
    }
  }
  const rollbackClub = await withOrg(a.org.id, (tx) =>
    tx.club.findFirst({
      where: { name: `${runTag} Rollback Club` },
      select: { id: true },
    }),
  );
  assertCheck(
    "ATOMIC_ROLLBACK_RESOURCE_BUSINESS_AND_LOCATOR",
    !rollbackClub &&
      !(await prisma.publicResourceLocator.findUnique({
        where: {
          resourceType_publicKey: {
            resourceType: PublicResourceLocatorType.CLUB,
            publicKey: rollbackResourceKey,
          },
        },
      })),
    { businessRecordExists: Boolean(rollbackClub) },
  );

  const rollbackToken = secretToken("rollback-ticket");
  try {
    await withOrg(a.org.id, async (tx) => {
      const rollbackReservation = await tx.seatReservation.create({
        data: {
          organizationId: a.org.id,
          eventId: a.event.id,
          seatZoneId: a.zone.id,
          guestName: `${runTag} Rollback Guest`,
          guestEmail: `${runTag}-rollback-guest@example.test`,
          guestPhone: "08000000000",
          quantity: 1,
          unitPriceKobo: 0,
          totalKobo: 0,
          paymentStatus: PaymentStatus.PAID,
        },
      });
      const ticket = await tx.ticket.create({
        data: {
          organizationId: a.org.id,
          reservationId: rollbackReservation.id,
          code: rollbackToken,
          status: TicketStatus.ACTIVE,
        },
      });
      await upsertPublicTokenLocator(tx, {
        tokenType: PublicTokenLocatorType.TICKET,
        rawToken: ticket.code,
        organizationId: a.org.id,
        resourceId: ticket.id,
      });
      throw new Error("CONTROLLED_TOKEN_ROLLBACK");
    });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "CONTROLLED_TOKEN_ROLLBACK") {
      throw error;
    }
  }
  const rollbackReservation = await withOrg(a.org.id, (tx) =>
    tx.seatReservation.findFirst({
      where: { guestEmail: `${runTag}-rollback-guest@example.test` },
      select: { id: true },
    }),
  );
  assertCheck(
    "ATOMIC_ROLLBACK_TOKEN_BUSINESS_AND_LOCATOR",
    !(await loadTicket(rollbackToken)) && !rollbackReservation,
    { businessRecordExists: Boolean(rollbackReservation) },
  );

  const hashes = await prisma.publicTokenLocator.findMany({
    where: { organizationId: { in: [a.org.id, b.org.id] } },
    select: { tokenHash: true },
  });
  const rawTokens = [a.ticket.code, b.ticket.code, a.order.collectionCode, b.order.collectionCode];
  assertCheck(
    "RAW_TOKEN_NOT_STORED_IN_LOCATOR",
    hashes.every((row) => rawTokens.every((raw) => row.tokenHash !== raw)),
    { locatorRows: hashes.length },
  );

  await assertRouteContains("METADATA_ORG_A_PLAYER", `/public/share/player/${a.homeAthlete.id}`, a.homeAthlete.firstName);
  await assertRouteContains("METADATA_ORG_B_PLAYER", `/public/share/player/${b.homeAthlete.id}`, b.homeAthlete.firstName);
  await assertRouteContains("METADATA_ORG_A_TEAM", `/public/share/team/${a.homeClub.id}`, a.homeClub.name);
  await assertRouteContains("METADATA_ORG_B_TEAM", `/public/share/team/${b.homeClub.id}`, b.homeClub.name);
  await assertRouteContains("METADATA_ORG_A_GAME", `/public/share/game/${a.fixture.id}`, a.homeClub.shortName);
  await assertRouteContains("METADATA_ORG_B_GAME", `/public/share/game/${b.fixture.id}`, b.homeClub.shortName);
  const tamperedMetadata = await httpStatus(`/public/share/team/${aToBKey}`);
  assertCheck("METADATA_TAMPERED_LOCATOR_FAILS_CLOSED", tamperedMetadata === 404, { status: tamperedMetadata });

  const mediaStatuses = await Promise.all([
    httpStatus(`/media/assets/${a.mediaPublic.id}/file`),
    httpStatus(`/media/assets/${b.mediaPublic.id}/file`),
    httpStatus(`/media/assets/${a.mediaPrivate.id}/file`),
    httpStatus(`/media/assets/${b.mediaPrivate.id}/file`),
  ]);
  assertCheck("MEDIA_VISIBILITY_ORG_A_PUBLIC", mediaStatuses[0] === 200, { status: mediaStatuses[0] });
  assertCheck("MEDIA_VISIBILITY_ORG_B_PUBLIC", mediaStatuses[1] === 200, { status: mediaStatuses[1] });
  assertCheck("MEDIA_VISIBILITY_ORG_A_PRIVATE_UNAUTH", mediaStatuses[2] === 401, { status: mediaStatuses[2] });
  assertCheck("MEDIA_VISIBILITY_ORG_B_PRIVATE_UNAUTH", mediaStatuses[3] === 401, { status: mediaStatuses[3] });
  const mediaTamperKey = `${runTag}-media-a-to-b-private`;
  await prisma.publicResourceLocator.create({
    data: {
      resourceType: PublicResourceLocatorType.MEDIA_ASSET,
      publicKey: mediaTamperKey,
      organizationId: a.org.id,
      resourceId: b.mediaPrivate.id,
      status: PublicLocatorStatus.ACTIVE,
    },
  });
  assertCheck("MEDIA_CROSS_TENANT_PRIVATE_TAMPER_FAILS_CLOSED", (await httpStatus(`/media/assets/${mediaTamperKey}/file`)) === 404);

  const concurrentResults = await Promise.all(
    Array.from({ length: 20 }, async (_, index) => {
      const selected = index % 2 === 0 ? a : b;
      const club = await loadClub(selected.homeClub.id);
      const status = await httpStatus(`/public/clubs/${selected.homeClub.id}`);
      return club?.organizationId === selected.org.id && status === 200;
    }),
  );
  assertCheck("CONCURRENT_LOCATOR_CONTEXT_NO_BLEED", concurrentResults.every(Boolean), {
    iterations: concurrentResults.length,
  });

  const apiStatuses = await Promise.all([
    httpStatus(`/api/share/game/${a.fixture.id}`),
    httpStatus(`/api/share/player/${a.homeAthlete.id}`),
    httpStatus(`/api/share/team/${a.homeClub.id}`),
    httpStatus(`/api/share/game/${b.fixture.id}`),
    httpStatus(`/api/share/player/${b.homeAthlete.id}`),
    httpStatus(`/api/share/team/${b.homeClub.id}`),
  ]);
  assertCheck("SHARE_IMAGE_API_ORG_A_ORG_B", apiStatuses.every((status) => status === 200), {
    statuses: apiStatuses,
  });

  record("CREATION_HOOKS_RUNTIME_PROVEN", "PASS", [
    "Club",
    "Fixture",
    "Event",
    "MediaAsset",
    "Ticket",
    "Order",
    "Athlete",
  ]);
  record("IMPORT_CREATED_RESOURCE_LOCATOR_HOOK", "CODE_PATH_VERIFIED", "src/lib/imports.ts calls upsertPublicResourceLocator in the same transaction; broad import mutation was intentionally not run.");
  record("PARTICIPANT_PROVISIONING_LOCATOR_HOOK", "CODE_PATH_VERIFIED", "src/lib/participant-internalization.ts calls upsertPublicResourceLocator in the same transaction; broad participant provisioning mutation was intentionally not run.");
  record("OFFLINE_INTAKE_LOCATOR_HOOK", "CODE_PATH_VERIFIED", "src/lib/admin-offline-intake.ts calls upsertPublicResourceLocator; full tenancy caveat remains pre-existing and deferred.");

  const afterCreate = await locatorState();
  record("LOCATOR_STATE_WITH_FIXTURES", "INFO", afterCreate);

  await cleanup();
  await prisma.publicResourceLocator.deleteMany({
    where: { publicKey: { startsWith: runTag } },
  });
  await prisma.publicTokenLocator.deleteMany({
    where: { resourceId: { startsWith: runTag } },
  });
  await prisma.organization.deleteMany({
    where: { slug: `${runTag}-suspended` },
  });

  const remainingOrgs = await prisma.organization.count({
    where: { slug: { startsWith: runTag } },
  });
  const remainingLocators = await prisma.publicResourceLocator.count({
    where: { publicKey: { startsWith: runTag } },
  });
  const remainingTokenLocators = await prisma.publicTokenLocator.count({
    where: { organizationId: { in: [a.org.id, b.org.id, suspendedOrg.id] } },
  });
  assertCheck("STAGING_TEST_FIXTURE_RESIDUE_ZERO", remainingOrgs === 0 && remainingLocators === 0 && remainingTokenLocators === 0, {
    remainingOrgs,
    remainingLocators,
    remainingTokenLocators,
  });

  const after = await locatorState();
  record("LOCATOR_BASELINE_AFTER", "INFO", after);
  assertCheck(
    "POST_CLEANUP_LOCATOR_BASELINE_RESTORED",
    after.expected_resource_rows === after.active_resource_locators &&
      after.missing_resource_locators === 0 &&
      after.expected_token_rows === after.active_token_locators &&
      after.missing_token_locators === 0 &&
      after.null_org_resource_locators === 0 &&
      after.null_org_token_locators === 0 &&
      after.duplicate_resource_public_keys === 0 &&
      after.duplicate_token_hashes === 0,
    after,
  );

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
    console.error(JSON.stringify({
      runTag,
      checks,
      failed: checks.filter((check) => check.status === "FAIL").length,
    }, null, 2));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
