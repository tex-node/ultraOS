import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";
import { computeEloRatings, DEFAULT_ELO, eloWinProbability, type EloGame } from "../src/lib/analytics/elo";

// Build Elo ratings from the league's finished games (streak v13, Prompt 3).
//
//   npx tsx scripts/recalculate-elo.ts --organization <orgId> [--sport basketball] [--dry-run]
//
// Ratings are per sport, because a 1500 in basketball and a 1500 in football are not the same claim. Games are read
// oldest-first, which is what makes "history" meaningful - a rebuild in a different order would produce different
// numbers and the report says so.
//
// Only FINAL fixtures count, and only those with a recorded score. A rated competitor is a SeasonClub or an Entrant;
// the table enforces that with a CHECK, so this script never writes both for one row.
const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const ORGANIZATION = arg("organization");
const ONLY_SPORT = arg("sport");
const DRY_RUN = process.argv.includes("--dry-run");
if (!ORGANIZATION) {
  console.error("usage: recalculate-elo.ts --organization <id> [--sport slug] [--dry-run]");
  process.exit(1);
}
const ORG: string = ORGANIZATION;

type Side = { seasonClubId: string | null; entrantId: string | null };

async function main() {
  const sports = await withOrganizationContext(ORG, (tx) =>
    tx.sport.findMany({
      where: { competitions: { some: { organizationId: ORG } } },
      select: { id: true, slug: true, name: true },
      orderBy: { slug: "asc" },
    }),
  );

  for (const sport of sports) {
    if (ONLY_SPORT && sport.slug !== ONLY_SPORT) continue;
    const fixtures = await withOrganizationContext(ORG, (tx) =>
      tx.fixture.findMany({
        where: {
          organizationId: ORG,
          status: "FINAL",
          division: { competition: { sportId: sport.id } },
        },
        orderBy: { scheduledAt: "asc" },
        select: {
          id: true,
          scheduledAt: true,
          homeScore: true,
          awayScore: true,
          homeSeasonClubId: true,
          awaySeasonClubId: true,
          homeEntrantId: true,
          awayEntrantId: true,
          division: { select: { competition: { select: { sport: { select: { slug: true } } } } } },
        },
      }),
    );
    if (fixtures.length === 0) {
      console.log(`${sport.slug}: no finished fixtures`);
      continue;
    }

    // A side is a SeasonClub OR an Entrant. Some demo fixtures carry BOTH ids, which violates the table's
    // subject CHECK (found on production: the public org's fixtures have an entrant id alongside a club id, and the
    // whole run failed on the first row). The season club wins - it is the team-sport identity.
    const sideOf = (seasonClubId: string | null, entrantId: string | null): Side =>
      seasonClubId ? { seasonClubId, entrantId: null } : { seasonClubId: null, entrantId };
    const games: (EloGame & { fixtureId: string; home: Side; away: Side })[] = [];
    for (const fixture of fixtures) {
      const homeKey = fixture.homeSeasonClubId ?? fixture.homeEntrantId;
      const awayKey = fixture.awaySeasonClubId ?? fixture.awayEntrantId;
      if (!homeKey || !awayKey || homeKey === awayKey) continue;
      games.push({
        fixtureId: fixture.id,
        homeKey,
        awayKey,
        homeScore: fixture.homeScore,
        awayScore: fixture.awayScore,
        drawsAllowed: true,
        playedAt: fixture.scheduledAt,
        home: sideOf(fixture.homeSeasonClubId, fixture.homeEntrantId),
        away: sideOf(fixture.awaySeasonClubId, fixture.awayEntrantId),
      });
    }

    const table = computeEloRatings(games);
    const ranked = [...table.values()].sort((a, b) => b.rating - a.rating);
    const best = ranked[0];
    const worst = ranked[ranked.length - 1];
    console.log(`\n${sport.name} (${sport.slug}): ${games.length} rated games, ${ranked.length} competitors`);
    for (const row of ranked.slice(0, 8)) {
      console.log(`  ${row.key.slice(0, 10)}… ${row.rating.toFixed(1)} · ${row.wins}-${row.losses}-${row.draws} (${row.games}g) · last ${row.lastChange >= 0 ? "+" : ""}${row.lastChange.toFixed(1)}`);
    }
    if (best && worst && ranked.length > 1) {
      console.log(`  spread: ${(best.rating - worst.rating).toFixed(1)} · best-vs-worst pre-match ${(eloWinProbability(best.rating, worst.rating) * 100).toFixed(1)}%`);
    }

    if (DRY_RUN) continue;

    // Which side (season club or entrant) a rating key belongs to. Built as explicit tuples: a mixed array of
    // [string, Side] pairs does not satisfy the Map constructor's inference.
    const pairs: [string, Side][] = [
      ...games.map((game) => [game.homeKey, game.home] as [string, Side]),
      ...games.map((game) => [game.awayKey, game.away] as [string, Side]),
    ];
    const byKey = new Map<string, Side>(pairs);
    let written = 0;
    await withOrganizationContext(ORG, async (tx) => {
      for (const row of ranked) {
        const side = byKey.get(row.key);
        if (!side) continue;
        await tx.eloRating.upsert({
          where: side.seasonClubId
            ? { organizationId_sportId_seasonClubId: { organizationId: ORG, sportId: sport.id, seasonClubId: side.seasonClubId } }
            : { organizationId_sportId_entrantId: { organizationId: ORG, sportId: sport.id, entrantId: side.entrantId! } },
          create: {
            organizationId: ORG,
            sportId: sport.id,
            seasonClubId: side.seasonClubId,
            entrantId: side.entrantId,
            rating: row.rating,
            games: row.games,
            wins: row.wins,
            losses: row.losses,
            draws: row.draws,
            lastChange: row.lastChange,
            computedAt: new Date(),
          },
          update: {
            rating: row.rating,
            games: row.games,
            wins: row.wins,
            losses: row.losses,
            draws: row.draws,
            lastChange: row.lastChange,
            computedAt: new Date(),
          },
        });
        written += 1;
      }
    });
    console.log(`  wrote ${written} rating row(s) (K=${DEFAULT_ELO.k}, home advantage ${DEFAULT_ELO.homeAdvantage}, draws included)`);

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
