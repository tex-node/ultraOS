// Sport-aware standings recalculation (Multi-sport Stage 8).
//
// Replaces the basketball-only recalculation with one that resolves the season's sport definition
// (including any organization override) and delegates to the generic standings engine. For
// basketball this reproduces the previous `won * 3` behaviour exactly (verified in
// src/lib/sports/standings.test.ts); for volleyball it awards match points by set score and writes
// the set ratio to StandingMetric.

import type { Prisma } from "@/generated/prisma/client";
import { competitiveFixtureScope } from "@/lib/competitive-scope";
import { computeSeasonStandings } from "@/lib/sports/standings";
import { resolveSportDefinitionForSportInTx } from "@/lib/sports/sport-override-store";

export async function recalculateStandings(
  tx: Prisma.TransactionClient,
  organizationId: string,
  seasonId: string,
) {
  const season = await tx.season.findUnique({
    where: { id: seasonId },
    select: { competition: { select: { sport: { select: { id: true, slug: true } } } } },
  });
  if (!season) return;

  const definition = await resolveSportDefinitionForSportInTx(tx, organizationId, season.competition.sport);

  const [teams, fixtures] = await Promise.all([
    tx.seasonClub.findMany({
      where: { seasonId },
      select: { id: true, club: { select: { name: true } }, entrant: { select: { id: true } } },
    }),
    tx.fixture.findMany({
      where: { seasonId, status: "FINAL", ...competitiveFixtureScope() },
      select: {
        homeSeasonClubId: true,
        awaySeasonClubId: true,
        homeScore: true,
        awayScore: true,
        winnerSeasonClubId: true,
      },
    }),
  ]);

  const computed = computeSeasonStandings(
    definition,
    teams.map((team) => ({
      seasonClubId: team.id,
      name: team.club.name,
      entrantId: team.entrant?.id ?? null,
    })),
    fixtures.map((fixture) => ({
      ...fixture,
      homeSeasonClubId: fixture.homeSeasonClubId!,
      awaySeasonClubId: fixture.awaySeasonClubId!,
    })),
  );

  for (const row of computed) {
    const standing = await tx.standing.upsert({
      where: { seasonClubId: row.seasonClubId },
      create: {
        organizationId,
        seasonId,
        seasonClubId: row.seasonClubId,
        entrantId: row.entrantId,
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
      },
      update: {
        entrantId: row.entrantId,
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
      },
    });

    for (const [metricKey, value] of Object.entries(row.secondary)) {
      await tx.standingMetric.upsert({
        where: { standingId_metricKey: { standingId: standing.id, metricKey } },
        create: { organizationId, standingId: standing.id, metricKey, value },
        update: { value },
      });
    }
  }
}
