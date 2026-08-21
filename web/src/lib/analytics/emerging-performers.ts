import type { PlayerDna, PlayerDnaDimensionKey } from "./player-dna";
import { PLAYER_DNA_DIMENSION_LABEL } from "./player-dna";
import type { SeasonPlayerTotals } from "./league-analytics";

// "Emerging Performers" is deliberately a separate concept from the Category Leaders — Season
// Zero's sample sizes are small (2-3 games per team), so a genuinely strong one-game showing
// would never surface on a leaderboard that correctly requires 2+ games to rank. This section
// exists to surface that showing WITHOUT pretending it's an established record: every entry is
// restricted to the DEVELOPING_PROFILE tier (exactly the players leaderboards exclude) and
// always carries its sample-confidence label alongside the standout number. No player here is
// ever described as a prospect, star, or future anything — only what they actually did.
const STANDOUT_THRESHOLD = 1.3;

export type EmergingPerformer = {
  playerId: string;
  name: string;
  seasonClubShortName: string;
  gamesPlayed: number;
  standoutDimension: PlayerDnaDimensionKey;
  standoutValue: string;
  leagueAverage: string;
};

export function findEmergingPerformers(dnaByPlayer: Map<string, PlayerDna>, totalsByPlayer: Map<string, SeasonPlayerTotals>, limit = 6): EmergingPerformer[] {
  const results: EmergingPerformer[] = [];
  for (const [playerId, dna] of dnaByPlayer) {
    if (dna.qualification !== "DEVELOPING_PROFILE") continue;
    const totals = totalsByPlayer.get(playerId);
    if (!totals) continue;

    // BALL_SECURITY is excluded as a qualifying dimension on its own — same reasoning as
    // player-archetype.ts: a single game with zero (or very few) turnovers is common for any
    // low-usage player and isn't a meaningful "performance discovery" on its own, even capped.
    const standout = [...dna.dimensions]
      .filter((d) => d.key !== "BALL_SECURITY" && d.index != null && d.index >= STANDOUT_THRESHOLD)
      .sort((a, b) => (b.index ?? 0) - (a.index ?? 0))[0];
    if (!standout) continue;

    results.push({
      playerId,
      name: totals.name,
      seasonClubShortName: totals.seasonClubShortName,
      gamesPlayed: dna.gamesPlayed,
      standoutDimension: standout.key,
      standoutValue: standout.playerValue,
      leagueAverage: standout.leagueAverage,
    });
  }
  return results
    .sort((a, b) => {
      const aDim = dnaByPlayer.get(a.playerId)!.dimensions.find((d) => d.key === a.standoutDimension)!.index!;
      const bDim = dnaByPlayer.get(b.playerId)!.dimensions.find((d) => d.key === b.standoutDimension)!.index!;
      return bDim - aDim;
    })
    .slice(0, limit);
}

export function emergingPerformerHeadline(p: EmergingPerformer): string {
  return `${p.standoutValue} ${PLAYER_DNA_DIMENSION_LABEL[p.standoutDimension].toLowerCase()} in ${p.gamesPlayed} game (league avg ${p.leagueAverage})`;
}
