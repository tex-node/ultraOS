import type { GameAnalyticsCapability } from "@/lib/game-data-capability";
import type { SeasonPlayerTotals } from "../league-analytics";
import type { PlayerArchetype } from "../player-archetype";
import { PLAYER_ARCHETYPE_LABEL } from "../player-archetype";
import type { PlayerDna } from "../player-dna";
import { PLAYER_DNA_DIMENSION_LABEL } from "../player-dna";
import type { RankBadge } from "../rank-context";
import { SAMPLE_CONFIDENCE_LABEL } from "../qualification";
import { formatPercent, percent } from "../normalization";
import type { PlayerLine, TopPerformer } from "../types";
import type { CardBase, CardMetric } from "./types";

// Card view models are pure — they consume already-computed canonical analytics objects
// (SeasonPlayerTotals, PlayerDna, RankBadge, TopPerformer) and never touch Prisma or recompute a
// number a domain file already owns. A view model is what a card component (web, broadcast,
// share) renders; it never queries data itself.

function bestRankLabel(ranks: RankBadge[]): string | null {
  if (ranks.length === 0) return null;
  const top = ranks[0];
  return `#${top.rank} ${top.shortLabel} · ${top.value} of ${top.totalQualified}`;
}

export type PlayerSpotlightCard = CardBase & { type: "PLAYER_SPOTLIGHT" };

export function buildPlayerSpotlightCard(
  totals: SeasonPlayerTotals,
  ranks: RankBadge[],
  photoUrl: string | null,
  capability: GameAnalyticsCapability,
): PlayerSpotlightCard {
  const ppg = totals.gamesPlayed > 0 ? (totals.points / totals.gamesPlayed).toFixed(1) : "0.0";
  const supporting: CardMetric[] = [
    { label: "Total Points", value: String(totals.points) },
    { label: "Games", value: String(totals.gamesPlayed) },
  ];
  return {
    type: "PLAYER_SPOTLIGHT",
    title: "Player Spotlight",
    eyebrow: "Season Zero",
    subject: totals.name,
    subjectImage: photoUrl,
    club: totals.seasonClubShortName,
    primaryMetric: { label: "PPG", value: ppg },
    supportingMetrics: supporting,
    rankContext: bestRankLabel(ranks),
    provenance: { source: "SeasonPlayerTotals", qualification: "games-played floor applied to rank context" },
    capability,
  };
}

export type GameStarCard = CardBase & { type: "GAME_STAR"; opponent: string };

export function buildGameStarCard(gameStar: TopPerformer, opponentShortName: string, capability: GameAnalyticsCapability): GameStarCard {
  const p = gameStar.player;
  return {
    type: "GAME_STAR",
    title: "Game Star",
    eyebrow: "Season Zero",
    subject: p.name,
    subjectImage: p.photoUrl,
    club: p.seasonClubShortName,
    opponent: opponentShortName,
    primaryMetric: { label: "EFF", value: String(p.efficiency ?? "—") },
    supportingMetrics: [
      { label: "PTS", value: String(p.points) },
      { label: "REB", value: String(p.rebounds) },
      { label: "AST", value: String(p.assists) },
      { label: "STL", value: String(p.steals) },
      { label: "BLK", value: String(p.blocks) },
    ],
    rankContext: null,
    provenance: { source: "selectTopPerformers()", qualification: "single-game box score" },
    capability,
  };
}

export type PlayerDnaCard = CardBase & { type: "PLAYER_DNA"; archetype: string | null; sampleLabel: string };

export function buildPlayerDnaCard(dna: PlayerDna, archetype: PlayerArchetype | null, photoUrl: string | null, seasonClubShortName: string, capability: GameAnalyticsCapability): PlayerDnaCard {
  const topDimensions = [...dna.dimensions]
    .filter((d) => d.index != null)
    .sort((a, b) => (b.index ?? 0) - (a.index ?? 0))
    .slice(0, 3);
  return {
    type: "PLAYER_DNA",
    title: "Player DNA",
    eyebrow: "Season Zero",
    subject: dna.name,
    subjectImage: photoUrl,
    club: seasonClubShortName,
    archetype: archetype ? PLAYER_ARCHETYPE_LABEL[archetype] : null,
    sampleLabel: SAMPLE_CONFIDENCE_LABEL[dna.qualification],
    primaryMetric: topDimensions[0]
      ? { label: PLAYER_DNA_DIMENSION_LABEL[topDimensions[0].key], value: `${(topDimensions[0].index as number).toFixed(2)}×` }
      : { label: "—", value: "—" },
    supportingMetrics: topDimensions.slice(1).map((d) => ({ label: PLAYER_DNA_DIMENSION_LABEL[d.key], value: `${(d.index as number).toFixed(2)}×` })),
    rankContext: null,
    provenance: { source: "computeLeaguePlayerDna()", qualification: SAMPLE_CONFIDENCE_LABEL[dna.qualification] },
    capability,
  };
}

export type PlayerBestGameCard = CardBase & { type: "PLAYER_BEST_GAME"; opponent: string };

// Accepts a structural shape matching PlayerBestGame (loadPlayerBestGame()'s return type) rather
// than importing it directly — game-analytics.ts is the one file in this domain layer allowed to
// touch Prisma, and importing from it here would risk eagerly loading the Prisma client into this
// otherwise-pure module (this exact class of bug broke `npx tsx --test` once before).
export function buildPlayerBestGameCard(
  best: { fixtureId: string; opponentShortName: string; points: number; rebounds: number; assists: number; steals: number; fieldGoalsMade: number | null; fieldGoalsAttempted: number | null; efficiency: number },
  playerName: string,
  seasonClubShortName: string,
  photoUrl: string | null,
  capability: GameAnalyticsCapability,
): PlayerBestGameCard {
  const fgPct = percent(best.fieldGoalsMade, best.fieldGoalsAttempted);
  return {
    type: "PLAYER_BEST_GAME",
    title: "Best Game",
    eyebrow: "Season Zero",
    subject: playerName,
    subjectImage: photoUrl,
    club: seasonClubShortName,
    opponent: best.opponentShortName,
    primaryMetric: { label: "PTS", value: String(best.points) },
    supportingMetrics: [
      { label: "REB", value: String(best.rebounds) },
      { label: "AST", value: String(best.assists) },
      { label: "STL", value: String(best.steals) },
      ...(fgPct != null ? [{ label: "FG%", value: formatPercent(fgPct) }] : []),
    ],
    rankContext: `vs ${best.opponentShortName}`,
    provenance: { source: "loadPlayerBestGame() — same effective-efficiency metric as Game Star", qualification: "single-game box score" },
    capability,
  };
}

// Capability-aware: never surfaces 4PT/Ultra Time fields for BOX_SCORE_ONLY, since PlayerLine's
// fourPointsMade/ultraTimePoints are simply not read anywhere in this file. A future FULL_ULTRA
// game only needs a caller to pass capability: "FULL_ULTRA" — this card already tolerates it,
// it just has nothing extra to show yet without a dedicated Ultra dimension being added upstream.
export function playerLineHasUltraFields(p: PlayerLine): boolean {
  return p.fourPointsAttempted != null || p.ultraTimePoints != null;
}
