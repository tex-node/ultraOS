import { prisma } from "@/lib/prisma";

// Data-quality metrics for the partners who bet on this data (streak v18, Prompt 4).
//
// Every number here is QUERIED, never asserted: a dashboard that reports a percentage it computed from a constant is
// worse than no dashboard, because it looks like evidence. The integrity checks mirror scripts/data/verify-batch.mjs -
// the same two sums (player points vs the team's score, period scores vs the final) - but run against the database
// rather than a JSON batch, and they report WHERE a mismatch is so someone can look.
//
// `statisticsVerifiedAt` is the field that exists for this purpose (the schema says a game can be finalised with
// statistics unverified), so the "verification rate" counts that, not a field that does not exist.

export type DataQualityReport = {
  finals: number;
  byOrigin: { origin: string; count: number }[];
  byStatSource: { source: string; count: number }[];
  verified: number;
  verifiedRate: number | null;
  highlights: number;
  integrity: {
    playerPointsMismatches: { gameId: string; side: "home" | "away"; score: number; statSum: number }[];
    periodSumMismatches: { gameId: string; side: "home" | "away"; finalScore: number; periodSum: number }[];
    checkedGames: number;
  };
};

export async function loadDataQuality(organizationId: string): Promise<DataQualityReport> {
  // The SCORE lives on the Fixture, not the Game (Game holds the clock/period state) - a detail worth stating because
  // reading it from the wrong table is how a "final" score and a "live" score drift apart.
  const finals = await prisma.game.findMany({
    where: { organizationId, status: "FINAL" },
    select: {
      id: true,
      statisticsVerifiedAt: true,
      fixture: { select: { recordOrigin: true, homeScore: true, awayScore: true, homeSeasonClubId: true, awaySeasonClubId: true } },
    },
  });

  const byOrigin = new Map<string, number>();
  for (const game of finals) {
    const origin = game.fixture?.recordOrigin ?? "UNKNOWN";
    byOrigin.set(origin, (byOrigin.get(origin) ?? 0) + 1);
  }

  const statSources = await prisma.game.groupBy({
    by: ["statSource"],
    where: { organizationId, status: "FINAL" },
    _count: { _all: true },
  });

  const verified = finals.filter((game) => game.statisticsVerifiedAt !== null).length;
  const highlights = await prisma.mediaAsset.count({
    where: { organizationId, purpose: "HIGHLIGHT_CLIP" },
  });

  const finalsWithScores = finals.filter((game) => game.fixture.homeScore !== null && game.fixture.awayScore !== null);
  const gameIds = finalsWithScores.map((game) => game.id);

  const [playerTotals, periodTotals] = await Promise.all([
    gameIds.length === 0
      ? []
      : prisma.playerStat.groupBy({ by: ["gameId", "seasonClubId"], where: { organizationId, gameId: { in: gameIds } }, _sum: { points: true } }),
    gameIds.length === 0
      ? []
      : prisma.gamePeriodScore.groupBy({ by: ["gameId", "period"], where: { organizationId, gameId: { in: gameIds } }, _sum: { homeScore: true, awayScore: true } }),
  ]);

  const playerPointsMismatches: DataQualityReport["integrity"]["playerPointsMismatches"] = [];
  for (const game of finalsWithScores) {
    const fixture = game.fixture;
    const rows = playerTotals.filter((row) => row.gameId === game.id);
    const homeSum = rows.filter((row) => row.seasonClubId === fixture.homeSeasonClubId).reduce((sum, row) => sum + (row._sum.points ?? 0), 0);
    const awaySum = rows.filter((row) => row.seasonClubId === fixture.awaySeasonClubId).reduce((sum, row) => sum + (row._sum.points ?? 0), 0);
    // Only flag a side that HAS stat rows: a game with no box score at all is missing data, not a mismatch, and
    // conflating the two is how a dashboard cries wolf until nobody reads it.
    if (rows.some((row) => row.seasonClubId === fixture.homeSeasonClubId) && homeSum !== game.fixture.homeScore) {
      playerPointsMismatches.push({ gameId: game.id, side: "home", score: game.fixture.homeScore!, statSum: homeSum });
    }
    if (rows.some((row) => row.seasonClubId === fixture.awaySeasonClubId) && awaySum !== game.fixture.awayScore) {
      playerPointsMismatches.push({ gameId: game.id, side: "away", score: game.fixture.awayScore!, statSum: awaySum });
    }
  }

  const periodSumMismatches: DataQualityReport["integrity"]["periodSumMismatches"] = [];
  for (const game of finalsWithScores) {
    const rows = periodTotals.filter((row) => row.gameId === game.id);
    if (rows.length === 0) continue;
    const homeSum = rows.reduce((sum, row) => sum + (row._sum.homeScore ?? 0), 0);
    const awaySum = rows.reduce((sum, row) => sum + (row._sum.awayScore ?? 0), 0);
    if (homeSum !== game.fixture.homeScore) periodSumMismatches.push({ gameId: game.id, side: "home", finalScore: game.fixture.homeScore!, periodSum: homeSum });
    if (awaySum !== game.fixture.awayScore) periodSumMismatches.push({ gameId: game.id, side: "away", finalScore: game.fixture.awayScore!, periodSum: awaySum });
  }

  const sourceCounts = new Map<string, number>();
  for (const row of statSources) {
    const key = row.statSource ?? "NOT_RECORDED";
    sourceCounts.set(key, row._count._all);
  }

  return {
    finals: finals.length,
    byOrigin: [...byOrigin.entries()].map(([origin, count]) => ({ origin, count })).sort((a, b) => b.count - a.count),
    byStatSource: [...sourceCounts.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count),
    verified,
    verifiedRate: finals.length === 0 ? null : verified / finals.length,
    highlights,
    integrity: {
      playerPointsMismatches,
      periodSumMismatches,
      checkedGames: finalsWithScores.length,
    },
  };
}
