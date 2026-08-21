import { playerBadges } from "./badges";
import type { BadgeKey, GameCore, PerformerCategory, PlayerLine, TopPerformer } from "./types";

function activePlayers(game: GameCore): PlayerLine[] {
  return game.players.filter((p) => !p.didNotPlay);
}

export function playerScoringShare(player: PlayerLine, game: GameCore): number | null {
  const team = player.side === "HOME" ? game.home : game.away;
  if (team.score === 0) return null;
  return (player.points / team.score) * 100;
}

// Efficiency proxy when the imported source didn't supply one: PTS + REB + AST + STL + BLK -
// missed FG - missed FT - TO. Only used as a fallback; a real `efficiency` field always wins.
// Narrowed to only the fields the formula actually reads (not the full PlayerLine shape) so
// G.17's live event-derived stats can reuse this exact same formula instead of a second "live
// efficiency" definition - see getLiveLeaders() in live-game-snapshot-v2.ts.
export type EfficiencyProxyInput = {
  points: number; rebounds: number; assists: number; steals: number; blocks: number; turnovers: number;
  fieldGoalsAttempted: number | null; fieldGoalsMade: number | null;
  freeThrowsAttempted: number | null; freeThrowsMade: number | null;
};

export function efficiencyProxy(p: EfficiencyProxyInput): number {
  const missedFg = p.fieldGoalsAttempted != null && p.fieldGoalsMade != null ? p.fieldGoalsAttempted - p.fieldGoalsMade : 0;
  const missedFt = p.freeThrowsAttempted != null && p.freeThrowsMade != null ? p.freeThrowsAttempted - p.freeThrowsMade : 0;
  return p.points + p.rebounds + p.assists + p.steals + p.blocks - missedFg - missedFt - p.turnovers;
}

export function effectiveEfficiency(p: PlayerLine): number {
  return p.efficiency ?? efficiencyProxy(p);
}

export function selectTopPerformers(game: GameCore): TopPerformer[] {
  const players = activePlayers(game);
  if (players.length === 0) return [];
  const performers: TopPerformer[] = [];
  const used = new Set<string>();

  function pick(category: PerformerCategory, sortFn: (a: PlayerLine, b: PlayerLine) => number, headline: (p: PlayerLine) => string, options: { allowReuse?: boolean; blocksOthers?: boolean } = {}) {
    const sorted = [...players].sort(sortFn);
    const candidate = options.allowReuse ? sorted[0] : sorted.find((p) => !used.has(p.playerId));
    if (!candidate) return;
    performers.push({ category, player: candidate, headline: headline(candidate) });
    // GAME_STAR is a spotlight, not an exclusive claim — the same player should still be able
    // to headline TOP_SCORER/TOP_REBOUNDER/etc. if they genuinely lead those categories too.
    if (options.blocksOthers !== false) used.add(candidate.playerId);
  }

  pick("GAME_STAR", (a, b) => effectiveEfficiency(b) - effectiveEfficiency(a), (p) => `${p.points} PTS · ${effectiveEfficiency(p)} EFF`, { allowReuse: true, blocksOthers: false });
  pick("TOP_SCORER", (a, b) => b.points - a.points, (p) => `${p.points} PTS`);
  pick("TOP_REBOUNDER", (a, b) => b.rebounds - a.rebounds, (p) => `${p.rebounds} REB`);
  pick("TOP_PLAYMAKER", (a, b) => b.assists - a.assists, (p) => `${p.assists} AST`);
  pick("TOP_DEFENDER", (a, b) => (b.steals + b.blocks) - (a.steals + a.blocks), (p) => `${p.steals} STL · ${p.blocks} BLK`);
  pick("MOST_EFFICIENT", (a, b) => effectiveEfficiency(b) - effectiveEfficiency(a), (p) => `${effectiveEfficiency(p)} EFF`);

  // BENCH_SPARK is deliberately not selected here — see the matching comment in badges.ts.
  // PlayerStat has no starter/bench flag for these games, so "top scorer among players on a
  // team with bench points" is not the same thing as "top bench performer" and would mislabel
  // starters as bench sparks whenever their team's bench also happened to score well.

  return performers;
}

export function playerBadgesForGame(game: GameCore): Map<string, BadgeKey[]> {
  const performers = selectTopPerformers(game);
  const gameStarId = performers.find((p) => p.category === "GAME_STAR")?.player.playerId;
  const result = new Map<string, BadgeKey[]>();
  for (const player of activePlayers(game)) {
    const badges = playerBadges(player, game, player.playerId === gameStarId);
    if (badges.length > 0) result.set(player.playerId, badges);
  }
  return result;
}
