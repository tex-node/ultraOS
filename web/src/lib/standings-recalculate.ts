// Sport-aware standings recalculation (Multi-sport Stage 8 + Stage B4).
//
// Resolves the season's sport definition (including any organization override) and delegates to the
// generic standings engine. Team sports are SeasonClub-keyed; individual sports (fixtures with only
// Entrant sides) are Entrant-keyed, using the same engine. Basketball reproduces `won * 3` exactly
// (verified in src/lib/sports/standings.test.ts).

import type { Prisma } from "@/generated/prisma/client";
import { competitiveFixtureScope } from "@/lib/competitive-scope";
import { computeSeasonStandings, type ComputedStandingRow } from "@/lib/sports/standings";
import { resolveSportDefinitionForSportInTx } from "@/lib/sports/sport-override-store";

async function upsertStanding(
  tx: Prisma.TransactionClient,
  organizationId: string,
  seasonId: string,
  party: { seasonClubId: string | null; entrantId: string | null },
  row: ComputedStandingRow,
) {
  const data = {
    organizationId,
    seasonId,
    seasonClubId: party.seasonClubId,
    entrantId: party.entrantId,
    played: row.played,
    won: row.won,
    drawn: row.drawn,
    lost: row.lost,
    ties: row.ties,
    noResult: row.noResult,
    pointsFor: row.pointsFor,
    pointsAgainst: row.pointsAgainst,
    pointDifference: row.pointDifference,
    leaguePoints: row.leaguePoints,
    rank: row.rank,
    rankTiebreak: row.rankTiebreak,
  };

  const standing = party.seasonClubId
    ? await tx.standing.upsert({ where: { seasonClubId: party.seasonClubId }, create: data, update: data })
    : await tx.standing.upsert({ where: { entrantId: party.entrantId! }, create: data, update: data });

  for (const [metricKey, value] of Object.entries(row.secondary)) {
    await tx.standingMetric.upsert({
      where: { standingId_metricKey: { standingId: standing.id, metricKey } },
      create: { organizationId, standingId: standing.id, metricKey, value },
      update: { value },
    });
  }
}

// Fair-play points by seasonClubId from card events in this season's games: yellow 1, red 3,
// fewer is better. Only sports whose catalog issues cards produce any; everyone else maps to
// zero and the FAIR_PLAY tiebreak key is a no-op for them.
async function buildFairPlayMap(tx: Prisma.TransactionClient, seasonId: string): Promise<Map<string, number>> {
const rows = await tx.gameEvent.groupBy({
by: ["seasonClubId", "typeKey"],
where: {
status: "ACTIVE",
seasonClubId: { not: null },
typeKey: { in: ["YELLOW_CARD", "RED_CARD"] },
game: { fixture: { seasonId } },
},
_count: { _all: true },
});
const points = new Map<string, number>();
for (const row of rows) {
if (!row.seasonClubId) continue;
const value = row.typeKey === "RED_CARD" ? 3 : 1;
points.set(row.seasonClubId, (points.get(row.seasonClubId) ?? 0) + value * row._count._all);
}
return points;
}

export async function recalculateStandings(  tx: Prisma.TransactionClient,
  organizationId: string,
  seasonId: string,
) {
  const season = await tx.season.findUnique({
    where: { id: seasonId },
    select: { competition: { select: { sport: { select: { id: true, slug: true } } } } },
  });
  if (!season) return;

  const definition = await resolveSportDefinitionForSportInTx(tx, organizationId, season.competition.sport);

  const [teams, entrants, fixtures] = await Promise.all([
    tx.seasonClub.findMany({
      where: { seasonId },
      select: { id: true, club: { select: { name: true } }, entrant: { select: { id: true } } },
    }),
    // Individual-sport competitors: entrants not bound to a SeasonClub.
    tx.entrant.findMany({
      where: { seasonId, seasonClubId: null },
      select: { id: true, name: true },
    }),
    tx.fixture.findMany({
      where: { seasonId, status: "FINAL", ...competitiveFixtureScope() },
      select: {
        homeSeasonClubId: true,
        awaySeasonClubId: true,
        homeEntrantId: true,
        awayEntrantId: true,
        homeScore: true,
        awayScore: true,
      },
    }),
  ]);

if (teams.length > 0) {
const teamFixtures = fixtures
.filter((fixture) => fixture.homeSeasonClubId && fixture.awaySeasonClubId)
.map((fixture) => ({
homeSeasonClubId: fixture.homeSeasonClubId!,
awaySeasonClubId: fixture.awaySeasonClubId!,
homeScore: fixture.homeScore,
awayScore: fixture.awayScore,
}));
const computed = computeSeasonStandings(
definition,
teams.map((team) => ({ seasonClubId: team.id, name: team.club.name, entrantId: team.entrant?.id ?? null })),
teamFixtures,
await buildFairPlayMap(tx, seasonId),
);
    for (const row of computed) {
      await upsertStanding(tx, organizationId, seasonId, { seasonClubId: row.seasonClubId, entrantId: row.entrantId }, row);
    }
  }

  if (entrants.length > 0) {
    const individualFixtures = fixtures
      .filter((fixture) => !fixture.homeSeasonClubId && !fixture.awaySeasonClubId && fixture.homeEntrantId && fixture.awayEntrantId)
      .map((fixture) => ({
        homeSeasonClubId: fixture.homeEntrantId!,
        awaySeasonClubId: fixture.awayEntrantId!,
        homeScore: fixture.homeScore,
        awayScore: fixture.awayScore,
      }));
    const computed = computeSeasonStandings(
      definition,
      entrants.map((entrant) => ({ seasonClubId: entrant.id, name: entrant.name, entrantId: entrant.id })),
      individualFixtures,
    );
    for (const row of computed) {
      await upsertStanding(tx, organizationId, seasonId, { seasonClubId: null, entrantId: row.seasonClubId }, row);
    }
  }
}
