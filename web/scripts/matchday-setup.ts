import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";
import { randomUUID } from "node:crypto";

// Streak v10, Prompt 3 verification setup: put one LIVE fixture per sport into one organization, so the match-day
// board has to render three sports at once.
//
//   npx tsx scripts/matchday-setup.ts --organization <orgId> [--cleanup]
//
// Basketball reuses a real fixture (the LBCL data). Tennis and volleyball are created here as minimal but real
// competitions - a season, sides, a venue, a live game - because that organization has no fixtures for them. The
// script prints `FIXTURE <sport> <id>` lines for the caller. --cleanup removes everything it created.
const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const ORGANIZATION = arg("organization");
const CLEANUP = process.argv.includes("--cleanup");
if (!ORGANIZATION) {
  console.error("usage: matchday-setup.ts --organization <id> [--cleanup]");
  process.exit(1);
}
const ORG: string = ORGANIZATION;
const TAG = "MATCHDAY VERIFY";

async function cleanup() {
  const removed = await withOrganizationContext(ORG, async (tx) => {
    const competitions = await tx.competition.findMany({ where: { organizationId: ORG, name: { startsWith: TAG } }, select: { id: true } });
    let fixtures = 0;
    for (const competition of competitions) {
      const seasons = await tx.season.findMany({ where: { competitionId: competition.id }, select: { id: true } });
      for (const season of seasons) {
        fixtures += (await tx.fixture.deleteMany({ where: { seasonId: season.id } })).count;
        await tx.standing.deleteMany({ where: { seasonId: season.id } });
        await tx.season.delete({ where: { id: season.id } });
      }
      await tx.division.deleteMany({ where: { competitionId: competition.id } });
      await tx.competition.delete({ where: { id: competition.id } });
    }
    await tx.club.deleteMany({ where: { organizationId: ORG, name: { startsWith: TAG } } });
    return { competitions: competitions.length, fixtures };
  });
  // Basket: put the reused basketball fixture back to FINAL, since the setup flipped it for the board.
  const reused = await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM "Fixture" WHERE id = ${process.env.BASKETBALL_FIXTURE ?? ""}`;
  if (reused.length > 0) {
    await withOrganizationContext(ORG, (tx) => tx.game.updateMany({ where: { fixtureId: reused[0].id }, data: { status: "FINAL" } }));
  }
  console.log(`cleanup: ${removed.competitions} competition(s), ${removed.fixtures} fixture(s) removed`);
}

async function main() {
  if (CLEANUP) {
    await cleanup();
    return;
  }

  const venue = await withOrganizationContext(ORG, (tx) => tx.venue.findFirstOrThrow({ where: { organizationId: ORG }, select: { id: true } }));

  // 1. Basketball: reuse a real fixture and make its game LIVE.
  const basketball = await withOrganizationContext(ORG, async (tx) => {
    const sport = await tx.sport.findFirstOrThrow({ where: { slug: "basketball" }, select: { id: true } });
    const fixture = await tx.fixture.findFirstOrThrow({ where: { organizationId: ORG, division: { competition: { sportId: sport.id } }, status: "FINAL" }, orderBy: { scheduledAt: "desc" }, select: { id: true } });
    await tx.game.updateMany({ where: { fixtureId: fixture.id }, data: { status: "LIVE", currentPeriod: 3, clockSecondsRemaining: 412 } });
    await tx.fixture.update({ where: { id: fixture.id }, data: { status: "LIVE" } });
    return fixture;
  });
  console.log(`FIXTURE basketball ${basketball.id}`);
  console.log(`BASKETBALL_FIXTURE=${basketball.id}`);

  // 2. Tennis and volleyball: minimal competitions with a live game each.
  for (const slug of ["tennis", "volleyball"] as const) {
    const fixtureId = await withOrganizationContext(ORG, async (tx) => {
      const sport = await tx.sport.findFirstOrThrow({ where: { slug }, select: { id: true } });
      const competition = await tx.competition.create({ data: { organizationId: ORG, sportId: sport.id, name: `${TAG} ${slug}`, slug: `matchday-${slug}-${Date.now()}` }, select: { id: true } });
      const division = await tx.division.create({ data: { organizationId: ORG, competitionId: competition.id, name: "Open", slug: "open" }, select: { id: true } });
      const season = await tx.season.create({ data: { organizationId: ORG, competitionId: competition.id, name: `${TAG} ${slug} season`, startDate: new Date(), endDate: new Date(Date.now() + 86400000) }, select: { id: true } });
      // Both sides must exist BEFORE the fixture insert: the table has a CHECK that a fixture has a consistent
      // pair of parties, so creating a side-less fixture and filling it in afterwards violates it (the first
      // version of this script did exactly that and rolled back).
      let homeSeasonClubId: string | null = null;
      let awaySeasonClubId: string | null = null;
      let homeEntrantId: string | null = null;
      let awayEntrantId: string | null = null;
      if (slug === "tennis") {
        // Individual sport: two entrants, no clubs.
        const entrants = [];
        for (const name of ["Court One", "Court Two"]) {
          const entrant = await tx.entrant.create({ data: { organizationId: ORG, competitionId: competition.id, seasonId: season.id, divisionId: division.id, type: "INDIVIDUAL", name: `${name} ${randomUUID().slice(0, 3)}` }, select: { id: true } });
          entrants.push(entrant.id);
        }
        homeEntrantId = entrants[0];
        awayEntrantId = entrants[1];
      } else {
        // Team sport: two clubs.
        const seasonClubs = [];
        for (const name of ["Net Six", "Spike Seven"]) {
          const club = await tx.club.create({ data: { organizationId: ORG, sportId: sport.id, name: `${TAG} ${name}`, shortName: `${name.slice(0, 2)}${randomUUID().slice(0, 3)}`.toUpperCase() }, select: { id: true } });
          const seasonClub = await tx.seasonClub.create({ data: { organizationId: ORG, seasonId: season.id, clubId: club.id, divisionId: division.id }, select: { id: true } });
          seasonClubs.push(seasonClub.id);
        }
        homeSeasonClubId = seasonClubs[0];
        awaySeasonClubId = seasonClubs[1];
      }
      const fixture = await tx.fixture.create({
        data: { organizationId: ORG, seasonId: season.id, divisionId: division.id, venueId: venue.id, scheduledAt: new Date(), status: "LIVE", homeSeasonClubId, awaySeasonClubId, homeEntrantId, awayEntrantId },
        select: { id: true },
      });
      await tx.game.create({ data: { organizationId: ORG, fixtureId: fixture.id, status: "LIVE", currentPeriod: 1, clockSecondsRemaining: 600 } });
      return fixture.id;
    });
    console.log(`FIXTURE ${slug} ${fixtureId}`);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
