import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";
import { createGame } from "../src/server/scoring/createGame";
import { randomUUID } from "node:crypto";

// Staging preparation for the browser specs (streak v21, Prompt 2).
//
//   npx tsx scripts/e2e-prepare.ts --organization <orgId>
//
// It creates (or repairs) three things the specs need and none of them may be guessed:
//   * a test administrator with a KNOWN password - the specs sign in through the real login form, so a password has to
//     exist; it is scoped to this deployment and its email is fixed so a re-run repairs it rather than multiplying it.
//   * an open competition with an open season - the registration form refuses to render without one.
//   * a LIVE fixture with a game - the capture console refuses to open without a game.
//
// Everything it prints is consumed by the runner as environment variables.
const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const ORGANIZATION = arg("organization");
if (!ORGANIZATION) {
  console.error("usage: e2e-prepare.ts --organization <id>");
  process.exit(1);
}
const ORG: string = ORGANIZATION;
const EMAIL = "e2e-admin@ultraleagueos.test";
const PASSWORD = "E2E-test-password-2026";

async function main() {
  // 1. The test admin. Real credentials, real SUPER_ADMIN role, and a password that is only ever set on a non-production
  // deployment by this script.
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    create: { email: EMAIL, name: "E2E Admin", passwordHash, emailVerified: new Date(), isActive: true, role: "SUPER_ADMIN" },
    update: { passwordHash, isActive: true, emailVerified: new Date() },
    select: { id: true, email: true },
  });
  // TWO grants, and the second is the one that matters: a platform-wide SUPER_ADMIN has organizationId = null in its
  // session, so every org-scoped page answers "No league yet". The specs must sign in as somebody who belongs to the
  // league they are testing, which is also what a real operator is. resolveActiveOrganizationId() takes the OLDEST
  // org-scoped grant, so this user belongs to exactly one organization - the one under test.
  const platformRole = await prisma.userRoleAssignment.findFirst({ where: { userId: user.id, role: "SUPER_ADMIN", organizationId: null }, select: { id: true } });
  if (!platformRole) {
    await prisma.userRoleAssignment.create({ data: { userId: user.id, role: "SUPER_ADMIN", organizationId: null } });
  }
  const orgRole = await prisma.userRoleAssignment.findFirst({ where: { userId: user.id, role: "SUPER_ADMIN", organizationId: ORG }, select: { id: true } });
  if (!orgRole) {
    await prisma.userRoleAssignment.create({ data: { userId: user.id, role: "SUPER_ADMIN", organizationId: ORG } });
  }
  // Any other org-scoped grant would send the session to a different league depending on grant order.
  await prisma.userRoleAssignment.deleteMany({ where: { userId: user.id, organizationId: { not: null, notIn: [ORG] } } });

  // 2. An open competition. Reused by slug so a re-run does not create another one.
  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: ORG }, select: { slug: true, name: true } });
  const competition = await withOrganizationContext(ORG, async (tx) => {
    const sport = await tx.sport.findFirstOrThrow({ where: { slug: "football" }, select: { id: true } });
    const slug = "e2e-open-registration";
    let row = await tx.competition.findFirst({ where: { organizationId: ORG, slug }, select: { id: true } });
    if (!row) {
      row = await tx.competition.create({ data: { organizationId: ORG, sportId: sport.id, name: "E2E Open Registration", slug }, select: { id: true } });
    }
    const openSeason = await tx.season.findFirst({ where: { competitionId: row.id, status: { in: ["ACTIVE", "DRAFT"] } }, select: { id: true } });
    if (!openSeason) {
      await tx.season.create({
        data: {
          organizationId: ORG,
          competitionId: row.id,
          name: `E2E Season ${new Date().getUTCFullYear()}`,
          startDate: new Date(),
          endDate: new Date(Date.now() + 90 * 86400_000),
          status: "ACTIVE",
        },
      });
    }
    return { id: row.id, slug };
  });

  // 3. A LIVE fixture with a game, for the scoring spec. Reuses one that is already live if present, because a second
  // live fixture would make the spec's "the score changed" assertion ambiguous about which one moved.
  const fixture = await withOrganizationContext(ORG, async (tx) => {
    const live = await tx.fixture.findFirst({
      where: { organizationId: ORG, status: "LIVE", game: { isNot: null } },
      select: { id: true },
    });
    if (live) return { id: live.id, created: false };

    const division = await tx.division.findFirstOrThrow({ where: { competitionId: competition.id }, select: { id: true } });
    const season = await tx.season.findFirstOrThrow({ where: { competitionId: competition.id }, select: { id: true } });
    const venue = await tx.venue.findFirstOrThrow({ where: { organizationId: ORG }, select: { id: true } });
    const sides = await tx.seasonClub.findMany({ where: { seasonId: season.id }, select: { id: true }, take: 2 });
    if (sides.length < 2) throw new Error("that competition needs two season clubs before a fixture can exist");

    const created = await tx.fixture.create({
      data: {
        organizationId: ORG,
        seasonId: season.id,
        divisionId: division.id,
        venueId: venue.id,
        scheduledAt: new Date(),
        status: "LIVE",
        homeSeasonClubId: sides[0].id,
        awaySeasonClubId: sides[1].id,
      },
      select: { id: true },
    });
    await createGame(
      { id: `e2e_${randomUUID().slice(0, 8)}`, fixtureId: created.id, status: "LIVE", currentPeriod: 1, clockSecondsRemaining: 2700 },
      { tx, actor: { id: user.id, organizationId: ORG }, source: "LIVE_UI" },
    );
    return { id: created.id, created: true };
  });

  console.log(`E2E_ADMIN_EMAIL=${EMAIL}`);
  console.log(`E2E_ADMIN_PASSWORD=${PASSWORD}`);
  console.log(`E2E_ORG_SLUG=${organization.slug}`);
  console.log(`E2E_COMPETITION_SLUG=${competition.slug}`);
  console.log(`E2E_FIXTURE_ID=${fixture.id}`);
  console.error(`prepared: admin ${user.email} · competition ${competition.slug} · fixture ${fixture.id} (${fixture.created ? "created" : "reused"})`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
