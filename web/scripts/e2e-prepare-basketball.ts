// E2E preparation for the A5 offline scoring proof: a BASKETBALL fixture with a LIVE game.
//
// `e2e-prepare.ts` hardcodes football, and the console only renders the offline capture panel for basketball
// (`isBasketball && game && status !== "FINAL"` in live/page.tsx) - which is also the A5 scope ("basketball scoring buttons
// for basketball fixtures"). So the offline spec needs a fixture the shared script cannot produce.
//
//   node --conditions=react-server --import tsx scripts/e2e-prepare-basketball.ts --organization <orgId>
//
// Prints the same E2E_* variables the other scripts do, so a runner can export them uniformly.
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { withOrganizationContext } from "@/lib/tenant-context";
import { createGame } from "@/server/scoring";

const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const ORGANIZATION = arg("organization");
if (!ORGANIZATION) {
  console.error("--organization <orgId> is required");
  process.exit(2);
}

async function main() {
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: ORGANIZATION },
    select: { id: true, slug: true },
  });

  // An admin who can drive the console. Reused, never created here: the other prepare script owns the account.
  const user = await prisma.user.findFirstOrThrow({
    where: { email: "e2e-admin@ultraleagueos.test" },
    select: { id: true },
  });

  const competition = await withOrganizationContext(organization.id, async (tx) => {
    const sport = await tx.sport.findFirstOrThrow({ where: { slug: "basketball" }, select: { id: true } });
    const slug = "e2e-offline-basketball";
    let row = await tx.competition.findFirst({ where: { organizationId: organization.id, slug }, select: { id: true } });
    if (!row) {
      row = await tx.competition.create({
        data: { organizationId: organization.id, sportId: sport.id, name: "E2E Offline Basketball", slug },
        select: { id: true },
      });
    }
    const division = (await tx.division.findFirst({ where: { competitionId: row.id }, select: { id: true } })) ??
      (await tx.division.create({ data: { organizationId: organization.id, competitionId: row.id, name: "E2E Division", slug: "e2e" }, select: { id: true } }));
    const season = (await tx.season.findFirst({ where: { competitionId: row.id, status: "ACTIVE" }, select: { id: true } })) ??
      (await tx.season.create({
        data: {
          organizationId: organization.id,
          competitionId: row.id,
          name: `E2E Offline Season ${new Date().getUTCFullYear()}`,
          startDate: new Date(),
          endDate: new Date(Date.now() + 90 * 86400_000),
          status: "ACTIVE",
        },
        select: { id: true },
      }));
    return { id: row.id, slug, divisionId: division.id, seasonId: season.id, sportId: sport.id };
  });

  const fixture = await withOrganizationContext(organization.id, async (tx) => {
    // One dedicated LIVE fixture, deleted and recreated each run: a second one would make "the score changed" ambiguous.
    const existing = await tx.fixture.findMany({
      where: { organizationId: organization.id, divisionId: competition.divisionId, status: "LIVE" },
      select: { id: true },
    });
    for (const old of existing) await tx.fixture.delete({ where: { id: old.id } });

    const venue = await tx.venue.findFirstOrThrow({ where: { organizationId: organization.id }, select: { id: true } });
    const sides: { id: string }[] = await tx.seasonClub.findMany({
      where: { seasonId: competition.seasonId },
      select: { id: true },
      take: 2,
    });
    while (sides.length < 2) {
      const index = sides.length + 1;
      const club = await tx.club.create({
        data: {
          organizationId: organization.id,
          sportId: competition.sportId,
          name: `E2E Hoops ${index}`,
          shortName: `EH${index}${Date.now().toString(36).slice(-2).toUpperCase()}`,
        },
        select: { id: true },
      });
      const seasonClub = await tx.seasonClub.create({
        data: { organizationId: organization.id, seasonId: competition.seasonId, clubId: club.id, divisionId: competition.divisionId },
        select: { id: true },
      });
      sides.push({ id: seasonClub.id });
    }

    const created = await tx.fixture.create({
      data: {
        organizationId: organization.id,
        seasonId: competition.seasonId,
        divisionId: competition.divisionId,
        venueId: venue.id,
        scheduledAt: new Date(),
        status: "LIVE",
        homeSeasonClubId: sides[0].id,
        awaySeasonClubId: sides[1].id,
      },
      select: { id: true },
    });
    await createGame(
      { id: `e2e_bball_${randomUUID().slice(0, 8)}`, fixtureId: created.id, status: "LIVE", currentPeriod: 1, clockSecondsRemaining: 2700 },
      { tx, actor: { id: user.id, organizationId: organization.id }, source: "LIVE_UI" },
    );
    return { id: created.id };
  });

  console.log(`E2E_ADMIN_EMAIL=e2e-admin@ultraleagueos.test`);
  console.log(`E2E_ORG_SLUG=${organization.slug}`);
  console.log(`E2E_BASKETBALL_COMPETITION_SLUG=${competition.slug}`);
  console.log(`E2E_FIXTURE_ID=${fixture.id}`);
  console.error(`prepared: basketball fixture ${fixture.id} in ${competition.slug}`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
