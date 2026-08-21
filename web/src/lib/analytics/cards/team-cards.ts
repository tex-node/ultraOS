import type { GameAnalyticsCapability } from "@/lib/game-data-capability";
import type { SeasonTeamTotals } from "../season-team-totals";
import type { RankBadge } from "../rank-context";
import type { TeamDna } from "../team-dna";
import { TEAM_DNA_DIMENSION_LABEL } from "../team-dna";
import { SAMPLE_CONFIDENCE_LABEL } from "../qualification";
import type { CardBase, CardMetric } from "./types";

function bestRankLabel(ranks: RankBadge[]): string | null {
  if (ranks.length === 0) return null;
  const top = ranks[0];
  return `#${top.rank} ${top.shortLabel} · ${top.value} of ${top.totalQualified}`;
}

export type TeamProfileCard = CardBase & { type: "TEAM_PROFILE"; record: string };

export function buildTeamProfileCard(totals: SeasonTeamTotals, dna: TeamDna | null, logoUrl: string | null, ranks: RankBadge[], capability: GameAnalyticsCapability): TeamProfileCard {
  const ppg = totals.gamesPlayed > 0 ? (totals.pointsFor / totals.gamesPlayed).toFixed(1) : "0.0";
  const oppPpg = totals.gamesPlayed > 0 ? (totals.pointsAgainst / totals.gamesPlayed).toFixed(1) : "0.0";
  const diff = totals.pointsFor - totals.pointsAgainst;
  const strongest = dna
    ? [...dna.dimensions].filter((d) => d.index != null).sort((a, b) => (b.index ?? 0) - (a.index ?? 0))[0]
    : null;
  return {
    type: "TEAM_PROFILE",
    title: "Team Profile",
    eyebrow: "Season Zero",
    subject: totals.name,
    subjectImage: logoUrl,
    club: totals.shortName,
    record: `${totals.wins}-${totals.losses}`,
    primaryMetric: { label: "PPG", value: ppg },
    supportingMetrics: [
      { label: "Opp PPG", value: oppPpg },
      { label: "Diff", value: diff > 0 ? `+${diff}` : String(diff) },
      ...(strongest ? [{ label: "Top Trait", value: TEAM_DNA_DIMENSION_LABEL[strongest.key] }] : []),
    ],
    rankContext: bestRankLabel(ranks),
    provenance: { source: "computeSeasonTeamTotals()", qualification: dna ? SAMPLE_CONFIDENCE_LABEL[dna.qualification] : "developing sample" },
    capability,
  };
}

export type TeamDnaBar = { label: string; value: string };
export type TeamDnaCard = CardBase & { type: "TEAM_DNA"; bars: TeamDnaBar[] };

// Broadcast composition prefers 3-5 horizontal trait bars over a radar chart — a radar reads
// fine on a wide web page but becomes unreadable at broadcast/social card scale.
export function buildTeamDnaCard(dna: TeamDna, teamName: string, logoUrl: string | null, capability: GameAnalyticsCapability): TeamDnaCard {
  const top = [...dna.dimensions]
    .filter((d) => d.index != null)
    .sort((a, b) => (b.index ?? 0) - (a.index ?? 0))
    .slice(0, 5);
  const bars: TeamDnaBar[] = top.map((d) => ({ label: TEAM_DNA_DIMENSION_LABEL[d.key], value: `${(d.index as number).toFixed(2)}×` }));
  return {
    type: "TEAM_DNA",
    title: "Team DNA",
    eyebrow: "Season Zero",
    subject: teamName,
    subjectImage: logoUrl,
    club: dna.shortName,
    bars,
    primaryMetric: bars[0] ?? { label: "—", value: "—" },
    supportingMetrics: bars.slice(1) as CardMetric[],
    rankContext: null,
    provenance: { source: "computeLeagueTeamDna()", qualification: SAMPLE_CONFIDENCE_LABEL[dna.qualification] },
    capability,
  };
}

export type TeamBestPerformanceCard = CardBase & { type: "TEAM_BEST_PERFORMANCE"; opponent: string };

// Accepts a structural shape matching TeamGameLogRow rather than importing it, for the same
// domain-purity reason documented in player-cards.ts's buildPlayerBestGameCard.
export function buildTeamBestPerformanceCard(
  best: { fixtureId: string; opponentShortName: string; pointsFor: number; pointsAgainst: number; margin: number; rebounds: number | null; benchPoints: number | null },
  teamName: string,
  shortName: string,
  logoUrl: string | null,
  capability: GameAnalyticsCapability,
): TeamBestPerformanceCard {
  return {
    type: "TEAM_BEST_PERFORMANCE",
    title: "Best Performance",
    eyebrow: "Season Zero",
    subject: teamName,
    subjectImage: logoUrl,
    club: shortName,
    opponent: best.opponentShortName,
    primaryMetric: { label: "Result", value: `${best.pointsFor}-${best.pointsAgainst}` },
    supportingMetrics: [
      { label: "Margin", value: best.margin > 0 ? `+${best.margin}` : String(best.margin) },
      ...(best.rebounds != null ? [{ label: "REB", value: String(best.rebounds) }] : []),
      ...(best.benchPoints != null ? [{ label: "Bench", value: String(best.benchPoints) }] : []),
    ],
    rankContext: `vs ${best.opponentShortName}`,
    provenance: { source: "selectBestTeamPerformance() — composite margin+rebounding+bench formula", qualification: "single-game box score" },
    capability,
  };
}

export type TeamLeaderCard = CardBase & { type: "TEAM_LEADER"; categoryLabel: string };

export function buildTeamLeaderCard(categoryLabel: string, rank: RankBadge, totals: SeasonTeamTotals, logoUrl: string | null, capability: GameAnalyticsCapability): TeamLeaderCard {
  return {
    type: "TEAM_LEADER",
    title: "Season Zero Team Leader",
    eyebrow: categoryLabel,
    subject: totals.name,
    subjectImage: logoUrl,
    club: totals.shortName,
    categoryLabel,
    primaryMetric: { label: rank.shortLabel, value: rank.value },
    supportingMetrics: [{ label: "Rank", value: `#${rank.rank} Season Zero` }],
    rankContext: `#${rank.rank} of ${rank.totalQualified}`,
    provenance: { source: "computeTeamRanks()", qualification: "qualification floor applied" },
    capability,
  };
}
