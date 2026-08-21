import type { GameAnalyticsCapability } from "@/lib/game-data-capability";
import { GAME_STORY_LABEL } from "../labels";
import type { TeamComparisonResult } from "../team-comparison";
import type { PlayerComparisonResult } from "../player-comparison";
import type { GameCore, GameStoryTag, WhyTheyWonFactor } from "../types";
import type { CardBase, CardMetric } from "./types";

export type GameResultCard = CardBase & { type: "GAME_RESULT"; homeScore: number; awayScore: number; storyTag: string | null };

export function buildGameResultCard(game: GameCore, tags: GameStoryTag[], keyStat: CardMetric | null, capability: GameAnalyticsCapability): GameResultCard {
  return {
    type: "GAME_RESULT",
    title: "Final",
    eyebrow: "Season Zero",
    subject: `${game.home.shortName} vs ${game.away.shortName}`,
    subjectImage: null,
    club: null,
    homeScore: game.home.score,
    awayScore: game.away.score,
    storyTag: tags[0] ? GAME_STORY_LABEL[tags[0]] : null,
    primaryMetric: { label: game.home.shortName, value: String(game.home.score) },
    supportingMetrics: [{ label: game.away.shortName, value: String(game.away.score) }, ...(keyStat ? [keyStat] : [])],
    rankContext: null,
    provenance: { source: "GameCore (official box score)", qualification: "FINAL game" },
    capability,
  };
}

export type WhyTheyWonCard = CardBase & { type: "WHY_THEY_WON"; winner: string };

export function buildWhyTheyWonCard(winnerShortName: string, factors: WhyTheyWonFactor[], capability: GameAnalyticsCapability): WhyTheyWonCard {
  const top = factors.slice(0, 3);
  return {
    type: "WHY_THEY_WON",
    title: `Why ${winnerShortName} Won`,
    eyebrow: "Season Zero",
    subject: winnerShortName,
    subjectImage: null,
    club: winnerShortName,
    winner: winnerShortName,
    primaryMetric: top[0] ? { label: top[0].label, value: `${top[0].winnerValue} vs ${top[0].loserValue}` } : { label: "—", value: "—" },
    supportingMetrics: top.slice(1).map((f) => ({ label: f.label, value: `${f.winnerValue} vs ${f.loserValue}` })),
    rankContext: null,
    // rankWhyTheyWon() already enforces the directional gate (a factor never appears if the
    // winner was actually worse on that metric) — this card only formats its output, never
    // re-derives which side "won" a stat.
    provenance: { source: "rankWhyTheyWon()", qualification: "directional gate enforced upstream" },
    capability,
  };
}

export type MatchupCard = CardBase & { type: "MATCHUP"; teamA: string; teamB: string; edges: { label: string; leader: string }[] };

export function buildMatchupCard(comparison: TeamComparisonResult, capability: GameAnalyticsCapability): MatchupCard {
  const edges = comparison.edges.map((e) => ({
    label: e.label,
    leader: e.result === "A" ? comparison.a.shortName : e.result === "B" ? comparison.b.shortName : e.result === "EVEN" ? "Even" : "—",
  }));
  return {
    type: "MATCHUP",
    title: `${comparison.a.shortName} vs ${comparison.b.shortName}`,
    eyebrow: "Season Zero",
    subject: `${comparison.a.shortName} vs ${comparison.b.shortName}`,
    subjectImage: null,
    club: null,
    teamA: comparison.a.shortName,
    teamB: comparison.b.shortName,
    edges,
    primaryMetric: edges[0] ? { label: edges[0].label, value: edges[0].leader } : { label: "—", value: "—" },
    supportingMetrics: edges.slice(1, 4).map((e) => ({ label: e.label, value: e.leader })),
    rankContext: null,
    // Never reimplement direction rules here — `compareTeams()` already routed every edge through
    // the shared compareByDirection() primitive; this card only formats the finished result.
    provenance: { source: "compareTeams() / compareByDirection()", qualification: "descriptive, not predictive" },
    capability,
  };
}

// Player matchup — identical shape/approach to the team matchup card above, sourced from
// comparePlayers() instead. Never a second direction-comparison implementation: PlayerHeadToHeadEdge
// entries are already the output of the same compareByDirection() primitive.
export function buildPlayerMatchupCard(comparison: PlayerComparisonResult, capability: GameAnalyticsCapability): MatchupCard {
  const edges = comparison.edges.map((e) => ({
    label: e.label,
    leader: e.result === "A" ? comparison.a.name : e.result === "B" ? comparison.b.name : e.result === "EVEN" ? "Even" : "—",
  }));
  return {
    type: "MATCHUP",
    title: `${comparison.a.name} vs ${comparison.b.name}`,
    eyebrow: "Season Zero",
    subject: `${comparison.a.name} vs ${comparison.b.name}`,
    subjectImage: null,
    club: null,
    teamA: comparison.a.name,
    teamB: comparison.b.name,
    edges,
    primaryMetric: edges[0] ? { label: edges[0].label, value: edges[0].leader } : { label: "—", value: "—" },
    supportingMetrics: edges.slice(1, 4).map((e) => ({ label: e.label, value: e.leader })),
    rankContext: null,
    provenance: { source: "comparePlayers() / compareByDirection()", qualification: "descriptive, not predictive" },
    capability,
  };
}
