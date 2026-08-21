import { isPlayerMetricQualified, PLAYER_METRICS, TEAM_METRICS, type PlayerMetricId, type TeamMetricId } from "./analytics-metrics";
import type { SeasonPlayerTotals } from "./league-analytics";
import { playerSampleQualification } from "./qualification";
import type { SeasonTeamTotals } from "./season-team-totals";

// League-wide rank ("#N in Season Zero") for a single player or team in a given metric.
// Ranking always happens among the metric's own qualified population — the same qualification
// rules Category Leaders and the leaderboards already use — so a small-sample player can never
// be ranked #1 in a percentage category just because nobody else with a real sample happens to
// beat their single lucky attempt.

export type RankBadge = { metricId: string; label: string; shortLabel: string; rank: number; totalQualified: number; value: string };

// Competition-style ranking: players tied on value share the same rank number (1, 1, 3 — never
// 1, 2, 3 for a genuine tie), computed as 1 + the count of values strictly better than this one.
function competitionRank(value: number, allValues: number[], direction: "HIGHER_IS_BETTER" | "LOWER_IS_BETTER"): number {
  const better = allValues.filter((v) => (direction === "HIGHER_IS_BETTER" ? v > value : v < value)).length;
  return better + 1;
}

export function computePlayerRanks(playerId: string, allTotals: SeasonPlayerTotals[]): RankBadge[] {
  const badges: RankBadge[] = [];
  for (const metric of PLAYER_METRICS) {
    if (metric.sourceRequirement !== "BOX_SCORE_ONLY") continue;
    const qualified = allTotals.filter((t) => playerSampleQualification(t.gamesPlayed) === "QUALIFIED" && isPlayerMetricQualified(metric, t));
    const target = qualified.find((t) => t.playerId === playerId);
    if (!target) continue;
    const value = metric.getValue(target);
    if (value == null) continue;
    const allValues = qualified.map((t) => metric.getValue(t)).filter((v): v is number => v != null);
    const rank = competitionRank(value, allValues, metric.direction);
    badges.push({ metricId: metric.id, label: metric.label, shortLabel: metric.shortLabel, rank, totalQualified: qualified.length, value: metric.formatter(value) });
  }
  return badges;
}

export function computeTeamRanks(seasonClubId: string, allTotals: SeasonTeamTotals[]): RankBadge[] {
  const badges: RankBadge[] = [];
  for (const metric of TEAM_METRICS) {
    if (metric.sourceRequirement !== "BOX_SCORE_ONLY") continue;
    const target = allTotals.find((t) => t.seasonClubId === seasonClubId);
    if (!target) continue;
    const value = metric.getValue(target);
    if (value == null) continue;
    const withValue = allTotals.filter((t) => metric.getValue(t) != null);
    const allValues = withValue.map((t) => metric.getValue(t)).filter((v): v is number => v != null);
    const rank = competitionRank(value, allValues, metric.direction);
    badges.push({ metricId: metric.id, label: metric.label, shortLabel: metric.shortLabel, rank, totalQualified: withValue.length, value: metric.formatter(value) });
  }
  return badges;
}

// The 3 categories where this player/team ranks best (lowest rank number), for a "prominent
// badges" display. Ties in rank keep registry order (stable sort) rather than reshuffling.
export function topRankBadges(badges: RankBadge[], limit = 3): RankBadge[] {
  return [...badges].sort((a, b) => a.rank - b.rank).slice(0, limit);
}

export type { PlayerMetricId, TeamMetricId };
