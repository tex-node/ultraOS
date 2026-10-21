import type { Prisma } from "@/generated/prisma/client";
import { eloWinProbability } from "@/lib/analytics/elo";

// Pre-match prior from the Elo table (streak v13, Prompt 3).
//
// The win-probability engine already had a PRIOR state that used whatever the caller supplied. This is the caller:
// it reads the two competitors' ratings for the fixture's sport and turns them into a home win probability. If either
// side has never been rated, it returns null rather than inventing a rating - "we do not know this team" is a better
// answer than "1500", which would look like knowledge.
export async function priorHomeWinForFixture(
  tx: Prisma.TransactionClient,
  organizationId: string,
  fixture: { homeSeasonClubId: string | null; awaySeasonClubId: string | null; homeEntrantId: string | null; awayEntrantId: string | null; sportId: string | null },
): Promise<number | null> {
  if (!fixture.sportId) return null;
  const homeKey = fixture.homeSeasonClubId ?? fixture.homeEntrantId;
  const awayKey = fixture.awaySeasonClubId ?? fixture.awayEntrantId;
  if (!homeKey || !awayKey) return null;

  const ratings = await tx.eloRating.findMany({
    where: {
      organizationId,
      sportId: fixture.sportId,
      OR: [{ seasonClubId: { in: [homeKey, awayKey] } }, { entrantId: { in: [homeKey, awayKey] } }],
    },
    select: { seasonClubId: true, entrantId: true, rating: true, games: true },
  });
  const find = (key: string) => ratings.find((row) => row.seasonClubId === key || row.entrantId === key);
  const home = find(homeKey);
  const away = find(awayKey);
  // A rating with no games behind it is the initial value, not a measurement.
  if (!home || !away || home.games === 0 || away.games === 0) return null;
  return Math.round(eloWinProbability(home.rating, away.rating) * 10_000) / 10_000;
}

/** The rating rows themselves, for the public team pages. */
export async function eloForSeasonClubs(
  tx: Prisma.TransactionClient,
  organizationId: string,
  seasonClubIds: string[],
): Promise<Map<string, { rating: number; games: number; wins: number; losses: number; draws: number; rank: number; of: number }>> {
  if (seasonClubIds.length === 0) return new Map();
  const rows = await tx.eloRating.findMany({
    where: { organizationId, seasonClubId: { in: seasonClubIds } },
    select: { seasonClubId: true, rating: true, games: true, wins: true, losses: true, draws: true, sportId: true },
  });
  const result = new Map<string, { rating: number; games: number; wins: number; losses: number; draws: number; rank: number; of: number }>();
  for (const row of rows) {
    if (!row.seasonClubId) continue;
    // Rank within the sport, so "3rd of 12" means something.
    const peers = await tx.eloRating.count({ where: { organizationId, sportId: row.sportId, rating: { gt: row.rating } } });
    const total = await tx.eloRating.count({ where: { organizationId, sportId: row.sportId } });
    result.set(row.seasonClubId, {
      rating: row.rating,
      games: row.games,
      wins: row.wins,
      losses: row.losses,
      draws: row.draws,
      rank: peers + 1,
      of: total,
    });
  }
  return result;
}
